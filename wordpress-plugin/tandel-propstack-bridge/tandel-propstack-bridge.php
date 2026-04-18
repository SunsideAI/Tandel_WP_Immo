<?php
/**
 * Plugin Name: Tandel Propstack Bridge
 * Description: REST-Endpoint fuer den Propstack -> WordPress Sync-Service.
 * Version:     0.1.0
 * Author:      Tandel Immobilien / SunsideAI
 * License:     Proprietary
 */

if (!defined('ABSPATH')) {
    exit;
}

// ============================================================
// 0. Konstanten / Konfiguration
// ============================================================
// Pruefe zuerst die Konstante aus wp-config.php, dann die Option als Fallback.
// TANDEL_SYNC_API_KEY muss in wp-config.php gesetzt sein:
//   define('TANDEL_SYNC_API_KEY', 'ein-langer-zufaelliger-key-min-32-zeichen');

define('TANDEL_SYNC_POST_TYPE', 'immobilie');
define('TANDEL_SYNC_META_PROPSTACK_ID', 'propstack_id');
define('TANDEL_SYNC_META_UNIT_ID', 'propstack_unit_id');
define('TANDEL_SYNC_META_IMAGE_ID', 'propstack_image_id');
define('TANDEL_SYNC_LOCK_TTL', 30); // Sekunden

// ============================================================
// 1. Post Type REST-faehig machen (zur Laufzeit)
// ============================================================
add_action('init', function () {
    global $wp_post_types;
    if (isset($wp_post_types[TANDEL_SYNC_POST_TYPE])) {
        $wp_post_types[TANDEL_SYNC_POST_TYPE]->show_in_rest = true;
        $wp_post_types[TANDEL_SYNC_POST_TYPE]->rest_base    = 'immobilien';
    }
}, 99);

// ============================================================
// 2. REST-Routen registrieren
// ============================================================
add_action('rest_api_init', function () {
    register_rest_route('tandel/v1', '/sync', [
        'methods'             => 'POST',
        'callback'            => 'tandel_handle_sync',
        'permission_callback' => 'tandel_check_api_key',
    ]);

    register_rest_route('tandel/v1', '/sync-images', [
        'methods'             => 'POST',
        'callback'            => 'tandel_handle_sync_images',
        'permission_callback' => 'tandel_check_api_key',
    ]);

    register_rest_route('tandel/v1', '/sync/delete', [
        'methods'             => 'POST',
        'callback'            => 'tandel_handle_delete',
        'permission_callback' => 'tandel_check_api_key',
    ]);

    register_rest_route('tandel/v1', '/lookup', [
        'methods'             => 'GET',
        'callback'            => 'tandel_handle_lookup',
        'permission_callback' => 'tandel_check_api_key',
    ]);
});

// ============================================================
// 3. Auth
// ============================================================
function tandel_check_api_key(WP_REST_Request $request)
{
    $expected = defined('TANDEL_SYNC_API_KEY')
        ? TANDEL_SYNC_API_KEY
        : get_option('tandel_sync_api_key');

    if (!is_string($expected) || strlen($expected) < 16) {
        return new WP_Error('config_missing', 'TANDEL_SYNC_API_KEY nicht konfiguriert', ['status' => 503]);
    }

    $provided = $request->get_header('x-tandel-api-key');
    if (!is_string($provided) || $provided === '') {
        return new WP_Error('forbidden', 'Missing API key', ['status' => 401]);
    }

    return hash_equals($expected, $provided)
        ? true
        : new WP_Error('forbidden', 'Invalid API key', ['status' => 401]);
}

// ============================================================
// 4. Utility: per-propstack-id Lock via Transient
// ============================================================
function tandel_acquire_lock($propstack_id)
{
    $key = 'tandel_lock_' . intval($propstack_id);
    if (get_transient($key)) {
        return false;
    }
    set_transient($key, 1, TANDEL_SYNC_LOCK_TTL);
    return true;
}

function tandel_release_lock($propstack_id)
{
    delete_transient('tandel_lock_' . intval($propstack_id));
}

// ============================================================
// 5. Sync-Handler: Stage 1 - Post + ACF-Felder
// ============================================================
function tandel_handle_sync(WP_REST_Request $request)
{
    $data = $request->get_json_params();

    $propstack_id = intval($data['propstack_id'] ?? 0);
    if ($propstack_id <= 0) {
        return new WP_Error('missing_id', 'propstack_id fehlt', ['status' => 400]);
    }

    if (!tandel_acquire_lock($propstack_id)) {
        return new WP_Error('locked', 'Sync fuer dieses Objekt laeuft bereits', ['status' => 423]);
    }

    try {
        $errors = [];

        $existing = tandel_find_post_by_propstack_id($propstack_id);

        $post_data = [
            'post_type'    => TANDEL_SYNC_POST_TYPE,
            'post_title'   => sanitize_text_field((string)($data['title'] ?? '')),
            'post_status'  => in_array($data['post_status'] ?? 'publish', ['publish', 'draft'], true)
                ? $data['post_status']
                : 'publish',
            'post_content' => '',
        ];

        if ($existing) {
            $post_data['ID'] = $existing->ID;
            $post_id         = wp_update_post($post_data, true);
        } else {
            $post_id = wp_insert_post($post_data, true);
        }

        if (is_wp_error($post_id)) {
            return $post_id;
        }

        update_post_meta($post_id, TANDEL_SYNC_META_PROPSTACK_ID, $propstack_id);
        if (!empty($data['propstack_unit_id'])) {
            update_post_meta($post_id, TANDEL_SYNC_META_UNIT_ID, sanitize_text_field((string)$data['propstack_unit_id']));
        }

        // ACF-Felder
        if (!empty($data['acf_fields']) && is_array($data['acf_fields'])) {
            if (!function_exists('update_field')) {
                $errors[] = ['field' => '*', 'message' => 'ACF nicht aktiv - update_field() fehlt'];
            } else {
                foreach ($data['acf_fields'] as $field_name => $value) {
                    try {
                        $ok = update_field($field_name, $value, $post_id);
                        if ($ok === false) {
                            $errors[] = ['field' => (string)$field_name, 'message' => 'update_field returned false'];
                        }
                    } catch (Throwable $e) {
                        $errors[] = ['field' => (string)$field_name, 'message' => $e->getMessage()];
                    }
                }
            }
        }

        // Kategorien (nur existierende zuweisen, fehlende in errors)
        if (!empty($data['categories']) && is_array($data['categories'])) {
            $term_ids = [];
            foreach ($data['categories'] as $slug) {
                $slug = sanitize_title((string)$slug);
                if ($slug === '') continue;
                $term = get_term_by('slug', $slug, 'category');
                if ($term && !is_wp_error($term)) {
                    $term_ids[] = (int)$term->term_id;
                } else {
                    $errors[] = ['field' => 'categories', 'message' => "Kategorie-Slug '{$slug}' nicht gefunden"];
                }
            }
            if (!empty($term_ids)) {
                wp_set_object_terms($post_id, $term_ids, 'category', false);
            }
        }

        $response = [
            'wp_post_id' => (int)$post_id,
            'status'     => $existing ? 'updated' : 'created',
        ];
        if (!empty($errors)) {
            $response['errors'] = $errors;
        }

        return rest_ensure_response($response);
    } finally {
        tandel_release_lock($propstack_id);
    }
}

// ============================================================
// 6. Sync-Handler: Stage 2 - Bilder nachladen
// ============================================================
function tandel_handle_sync_images(WP_REST_Request $request)
{
    $data         = $request->get_json_params();
    $propstack_id = intval($data['propstack_id'] ?? 0);

    if ($propstack_id <= 0) {
        return new WP_Error('missing_id', 'propstack_id fehlt', ['status' => 400]);
    }

    $existing = tandel_find_post_by_propstack_id($propstack_id);
    if (!$existing) {
        return new WP_Error('not_found', "Kein Post fuer propstack_id {$propstack_id}", ['status' => 404]);
    }

    $post_id = (int)$existing->ID;
    $images  = is_array($data['images'] ?? null) ? $data['images'] : [];

    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $uploaded  = 0;
    $skipped   = 0;
    $errors    = [];
    $image_ids = [];

    foreach ($images as $img) {
        $url       = isset($img['url']) ? esc_url_raw((string)$img['url']) : '';
        $ps_img_id = isset($img['propstack_image_id']) ? intval($img['propstack_image_id']) : 0;
        $title     = isset($img['title']) ? sanitize_text_field((string)$img['title']) : '';

        if ($url === '' || $ps_img_id <= 0) {
            $errors[] = ['propstack_image_id' => $ps_img_id, 'message' => 'Ungueltige URL oder ID'];
            continue;
        }

        // Duplikat-Check via Meta.
        $existing_media = get_posts([
            'post_type'      => 'attachment',
            'meta_key'       => TANDEL_SYNC_META_IMAGE_ID,
            'meta_value'     => (string)$ps_img_id,
            'posts_per_page' => 1,
            'fields'         => 'ids',
        ]);

        if (!empty($existing_media)) {
            $image_ids[] = (int)$existing_media[0];
            $skipped++;
            continue;
        }

        $tmp = download_url($url, 30);
        if (is_wp_error($tmp)) {
            $errors[] = ['propstack_image_id' => $ps_img_id, 'message' => 'download_url: ' . $tmp->get_error_message()];
            continue;
        }

        $filename = basename(parse_url($url, PHP_URL_PATH) ?: 'propstack-' . $ps_img_id . '.jpg');
        $file     = [
            'name'     => $filename,
            'tmp_name' => $tmp,
        ];

        $media_id = media_handle_sideload($file, $post_id, $title !== '' ? $title : null);
        if (is_wp_error($media_id)) {
            @unlink($tmp);
            $errors[] = ['propstack_image_id' => $ps_img_id, 'message' => 'sideload: ' . $media_id->get_error_message()];
            continue;
        }

        update_post_meta($media_id, TANDEL_SYNC_META_IMAGE_ID, $ps_img_id);
        if ($title !== '') {
            update_post_meta($media_id, '_wp_attachment_image_alt', $title);
        }

        $image_ids[] = (int)$media_id;
        $uploaded++;
    }

    // Hauptbild + Galerie setzen, wenn wir mindestens ein Bild haben.
    if (!empty($image_ids) && function_exists('update_field')) {
        set_post_thumbnail($post_id, $image_ids[0]);
        update_field('field_data_field_upload_image', $image_ids[0], $post_id);

        if (count($image_ids) > 1) {
            update_field('bild_1', array_slice($image_ids, 1), $post_id);
        } else {
            update_field('bild_1', [], $post_id);
        }
    }

    $response = [
        'wp_post_id' => $post_id,
        'uploaded'   => $uploaded,
        'skipped'    => $skipped,
    ];
    if (!empty($errors)) {
        $response['errors'] = $errors;
    }

    return rest_ensure_response($response);
}

// ============================================================
// 7. Delete-Handler: Post auf Draft setzen
// ============================================================
function tandel_handle_delete(WP_REST_Request $request)
{
    $data         = $request->get_json_params();
    $propstack_id = intval($data['propstack_id'] ?? 0);

    $existing = tandel_find_post_by_propstack_id($propstack_id);
    if (!$existing) {
        return rest_ensure_response(['status' => 'not_found', 'wp_post_id' => null]);
    }

    wp_update_post([
        'ID'          => $existing->ID,
        'post_status' => 'draft',
    ]);

    return rest_ensure_response([
        'wp_post_id' => (int)$existing->ID,
        'status'     => 'archived',
    ]);
}

// ============================================================
// 8. Lookup-Handler
// ============================================================
function tandel_handle_lookup(WP_REST_Request $request)
{
    $propstack_id = intval($request->get_param('propstack_id'));

    $existing = tandel_find_post_by_propstack_id($propstack_id);
    if (!$existing) {
        return rest_ensure_response(['found' => false]);
    }

    return rest_ensure_response([
        'found'      => true,
        'wp_post_id' => (int)$existing->ID,
        'status'     => $existing->post_status,
    ]);
}

// ============================================================
// 9. Helper
// ============================================================
function tandel_find_post_by_propstack_id($propstack_id)
{
    $posts = get_posts([
        'post_type'      => TANDEL_SYNC_POST_TYPE,
        'meta_key'       => TANDEL_SYNC_META_PROPSTACK_ID,
        'meta_value'     => (string)intval($propstack_id),
        'post_status'    => 'any',
        'posts_per_page' => 1,
        'no_found_rows'  => true,
    ]);
    return !empty($posts) ? $posts[0] : null;
}

/**
 * Payload-Typ für den WordPress Bridge-Plugin Endpoint POST /tandel/v1/sync.
 * Diese Definition ist authoritativ - das PHP-Plugin muss die gleichen Feldnamen erwarten.
 */
export interface BridgeSyncPayload {
  propstack_id: number;
  propstack_unit_id?: string;
  title: string;
  post_status: 'publish' | 'draft';

  acf_fields: Record<string, string | number | boolean | string[] | null>;

  categories: string[];

  /**
   * Bilder werden im 2-Stufen-Modell NICHT im ersten Sync-Call mitgeschickt,
   * sondern mit einem separaten POST /tandel/v1/sync-images nachgeladen.
   * Für den zweiten Call siehe BridgeImageSyncPayload.
   */
}

export interface BridgeImageSyncPayload {
  propstack_id: number;
  images: Array<{
    url: string;
    propstack_image_id: number;
    is_floorplan: boolean;
    title?: string;
    position?: number;
  }>;
}

export interface BridgeSyncResponse {
  wp_post_id: number;
  status: 'created' | 'updated';
  errors?: Array<{ field: string; message: string }>;
}

export interface BridgeImagesResponse {
  wp_post_id: number;
  uploaded: number;
  skipped: number;
  errors?: Array<{ propstack_image_id: number; message: string }>;
}

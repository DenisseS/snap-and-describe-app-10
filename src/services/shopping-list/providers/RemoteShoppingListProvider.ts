
import { ShoppingList, ShoppingListData } from '@/types/shoppingList';
import SessionService from '@/services/SessionService';
import { GenericShoppingListProvider } from './GenericShoppingListProvider';
import { SHOPPING_LIST_CACHE_KEYS } from '@/constants/cacheKeys';
import { QueueClient } from '@/services/sw/QueueClient';
import { DROPBOX_APP_FOLDER_PATH } from "@/constants/dropbox.ts";

export class RemoteShoppingListProvider extends GenericShoppingListProvider {
  constructor(sessionService: SessionService) {
    super(sessionService);
  }

  // Nueva implementación con sync usando DROPBOX_FILE_ cache (no LOCAL_)
  protected async getListsDetails(): Promise<{ lists: Record<string, ShoppingList> }> {
    console.log('🛒 RemoteProvider: Loading lists metadata from remote with sync');
    const result = await this.sessionService.getFile(SHOPPING_LIST_CACHE_KEYS.REMOTE_SHOPPING_LISTS_PATH);
    const profileData = result.data || { lists: {} };

    return { lists: profileData.shoppingLists || {} };
  }

  private resolveListPath(listId: string): string {
    return `${DROPBOX_APP_FOLDER_PATH}${SHOPPING_LIST_CACHE_KEYS.REMOTE_LIST_PREFIX}${listId}.json`;
  }

  // Update cache remoto + background sync (no LOCAL_)
  protected async saveListsDetails(metadata: { lists: Record<string, ShoppingList> }): Promise<void> {
    console.log('🛒 RemoteProvider: Saving lists metadata optimistically');

    // Background sync fire-and-forget (SessionService maneja el cache DROPBOX_FILE_)
    const profileData = { shoppingLists: metadata.lists };
    this.sessionService.updateFile(SHOPPING_LIST_CACHE_KEYS.REMOTE_SHOPPING_LISTS_PATH, profileData);
  }

  // Cache remoto como fuente de verdad con sync handler (no LOCAL_)
  protected async getListData(listId: string): Promise<ShoppingListData | null> {
    console.log(`🛒 RemoteProvider: Loading list ${listId} from remote`);
    const result = await this.sessionService.getFile(this.resolveListPath(listId));
    return result.data;
  }

  // Override del método getShoppingLists para añadir syncHandler
  async getShoppingLists(): Promise<{
    data: Record<string, ShoppingList>;
    state: any;
    syncHandler?: (onUpdate: (data: Record<string, ShoppingList>) => void, onSyncStatusChange: (isSyncing: boolean) => void) => void;
  }> {
    const result = await super.getShoppingLists();

    // Si hay data de cache, añadir sync handler
    if (result.data && Object.keys(result.data).length > 0) {
      return {
        ...result,
        syncHandler: (onUpdate, onSyncStatusChange) => {
          this.performListsMetadataSync(onUpdate, onSyncStatusChange);
        }
      };
    }

    return result;
  }

  // Override del método para añadir syncHandler
  async getShoppingListData(listId: string): Promise<{
    data: ShoppingListData | null;
    state: any;
    syncHandler?: (onUpdate: (data: ShoppingListData) => void, onSyncStatusChange: (isSyncing: boolean) => void) => void;
  }> {
    const result = await super.getShoppingListData(listId);

    // Si hay data de cache, añadir sync handler
    if (result.data) {
      return {
        ...result,
        syncHandler: (onUpdate, onSyncStatusChange) => {
          this.performListSync(listId, onUpdate, onSyncStatusChange);
        }
      };
    }

    return result;
  }

  // Sincronización específica para metadata de listas
  private async performListsMetadataSync(
    onUpdate: (data: Record<string, ShoppingList>) => void,
    onSyncStatusChange: (isSyncing: boolean) => void
  ): Promise<void> {
    console.log('🛒 RemoteProvider: Starting background sync for lists metadata...');
    onSyncStatusChange(true);

    try {
      const filePath = SHOPPING_LIST_CACHE_KEYS.REMOTE_SHOPPING_LISTS_PATH;
      const result = await this.sessionService.getFile(filePath);

      if (result.syncHandler) {
        result.syncHandler(
          (updatedProfileData) => {
            console.log('🛒 RemoteProvider: Lists metadata updated from remote sync');
            // Notificar a la UI (cache DROPBOX_FILE_ manejado por SessionService)
            const listsData = { lists: updatedProfileData.shoppingLists || {} };
            onUpdate(listsData.lists);
          },
          onSyncStatusChange
        );
      } else {
        onSyncStatusChange(false);
      }
    } catch (error) {
      console.error('🛒 RemoteProvider: Error in lists metadata sync:', error);
      onSyncStatusChange(false);
    }
  }

  // Sincronización específica para listas
  private async performListSync(
    listId: string,
    onUpdate: (data: ShoppingListData) => void,
    onSyncStatusChange: (isSyncing: boolean) => void
  ): Promise<void> {
    console.log(`🛒 RemoteProvider: Starting background sync for list ${listId}...`);
    onSyncStatusChange(true);

    try {
      const filePath = this.resolveListPath(listId);
      const result = await this.sessionService.getFile(filePath);

      if (result.syncHandler) {
        result.syncHandler(
          async (updatedData) => {
            console.log(`🛒 RemoteProvider: List ${listId} updated from remote sync`);
            
            // Keep lists metadata counts in sync with the latest snapshot
            try {
              const itemCount = Array.isArray(updatedData.items) ? updatedData.items.length : 0;
              const completedCount = Array.isArray(updatedData.items)
                ? updatedData.items.filter((i) => i.purchased).length
                : 0;
              const metadata = await this.getListsDetails();
              if (metadata.lists[listId]) {
                metadata.lists[listId] = {
                  ...metadata.lists[listId],
                  itemCount,
                  completedCount,
                  updatedAt: updatedData.updatedAt || new Date().toISOString(),
                };
                await this.saveListsDetails(metadata);
              }
            } catch (err) {
              console.error(`🛒 RemoteProvider: Failed to sync metadata counts for list ${listId} from remote update:`, err);
            }

            onUpdate(updatedData);
          },
          onSyncStatusChange
        );
      } else {
        onSyncStatusChange(false);
      }
    } catch (error) {
      console.error(`🛒 RemoteProvider: Error in list sync for ${listId}:`, error);
      onSyncStatusChange(false);
    }
  }

  // Update cache remoto + background sync (no LOCAL_)
  protected async saveListData(listId: string, data: ShoppingListData): Promise<void> {
    console.log(`🛒 RemoteProvider: Saving list ${listId} data optimistically`);

    // Enqueue to Service Worker generic queue (fire-and-forget)
    QueueClient.getInstance().enqueue('shopping-lists', listId, data);
  }

  protected async createListData(listId: string, data: ShoppingListData): Promise<void> {
    console.log(`🛒 RemoteProvider: Creating list ${listId} data optimistically`);

    // Enqueue to Service Worker generic queue (fire-and-forget)
    const path = this.resolveListPath(listId);
    await this.sessionService.updateFile(path, data);
  }

  protected async deleteListData(listId: string): Promise<void> {
    console.log(`🛒 RemoteProvider: Deleting list ${listId} optimistically`);

    // Background delete (cache DROPBOX_FILE_ manejado por SessionService)
    const path = this.resolveListPath(listId);
    await this.sessionService.deleteFile(path);
  }

  // Force refresh a list from remote (Dropbox) and override local cache/UI
  public async forceRefreshListData(listId: string): Promise<ShoppingListData | null> {
    console.log(`🛒 RemoteProvider: Forcing refresh for list ${listId} from remote`);
    const filePath = this.resolveListPath(listId);
    try {
      const remoteData = await this.sessionService.forceRemoteFetch(filePath);
      if (remoteData) {

        // Keep lists metadata counts in sync with the latest snapshot
        try {
          const itemCount = Array.isArray(remoteData.items) ? remoteData.items.length : 0;
          const completedCount = Array.isArray(remoteData.items)
            ? remoteData.items.filter((i: any) => i.purchased).length
            : 0;
          const metadata = await this.getListsDetails();
          if (metadata.lists[listId]) {
            metadata.lists[listId] = {
              ...metadata.lists[listId],
              itemCount,
              completedCount,
              updatedAt: remoteData.updatedAt || new Date().toISOString(),
            };
            await this.saveListsDetails(metadata);
          }
        } catch (err) {
          console.error(`🛒 RemoteProvider: Failed to update metadata after force refresh for ${listId}:`, err);
        }

        return remoteData;
      }
      return null;
    } catch (e) {
      console.error(`🛒 RemoteProvider: Force refresh error for ${listId}:`, e);
      return null;
    }
  }

  async mergeLocalListsWithRemote(): Promise<{ success: boolean }> {
    console.log('🛒 RemoteProvider: Starting merge of local lists with remote');

    try {
      // Get local data
      const localMetadata = this.sessionService.getLocalFile(SHOPPING_LIST_CACHE_KEYS.LOCAL_SHOPPING_LISTS) || { lists: {} };

      if (Object.keys(localMetadata.lists).length === 0) {
        console.log('🛒 RemoteProvider: No local lists to merge');
        return { success: true };
      }

      console.log(`🛒 RemoteProvider: Found ${Object.keys(localMetadata.lists).length} local lists to merge`);

      // Update remote usando el nuevo patrón simplificado
      await this.saveListsDetails(localMetadata);

      // Upload individual list data files
      for (const listId of Object.keys(localMetadata.lists)) {
        const localListData = this.sessionService.getLocalFile(`${SHOPPING_LIST_CACHE_KEYS.LOCAL_LIST_DATA_PREFIX}${listId}`);
        if (localListData) {
          await this.saveListData(listId, localListData);
        }
      }

      // Clear local data after successful merge
      this.sessionService.clearLocalCache("LOCAL_");
      console.log('🛒 RemoteProvider: Local shopping lists cleared after successful merge');

      console.log('🛒 RemoteProvider: Merge completed successfully');
      return { success: true };
    } catch (error) {
      console.error('🛒 RemoteProvider: Merge failed:', error);
      return { success: false };
    }
  }
}

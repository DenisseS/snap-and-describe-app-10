
import { CACHE_PREFIXES } from '@/constants/cacheKeys';

export const useUserCache = () => {
  const clearCacheByPrefix = (prefix: string) => {
    console.log(`🗑️ Clearing cache with prefix: ${prefix}`);
    const keys = Object.keys(localStorage);
    const keysToRemove = keys.filter(key => key.startsWith(prefix));
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`🗑️ Removed cache key: ${key}`);
    });
    
    return keysToRemove.length;
  };

  const clearUserCache = (): number => {
    console.log('🗑️ Clearing user-specific cache (not shopping lists)...');
    const userKeysRemoved = clearCacheByPrefix(CACHE_PREFIXES.USER_PREFIX);
    const dropboxKeysRemoved = clearCacheByPrefix(CACHE_PREFIXES.DROPBOX_PREFIX);
    const prefKeysRemoved = clearCacheByPrefix(CACHE_PREFIXES.PREF_PREFIX);
    
    const totalRemoved = userKeysRemoved + dropboxKeysRemoved + prefKeysRemoved;
    console.log(`🗑️ Total user cache keys removed: ${totalRemoved}`);
    return totalRemoved;
  };

  const clearAppCache = (): number => {
    console.log('🗑️ Clearing app cache...');
    return clearCacheByPrefix(CACHE_PREFIXES.APP_PREFIX);
  };

  const hasUserCache = (): boolean => {
    const keys = Object.keys(localStorage);
    return keys.some(key => 
      key.startsWith(CACHE_PREFIXES.USER_PREFIX) || 
      key.startsWith(CACHE_PREFIXES.DROPBOX_PREFIX) ||
      key.startsWith(CACHE_PREFIXES.PREF_PREFIX)
    );
  };

  const getUserCacheInfo = () => {
    const keys = Object.keys(localStorage);
    const userKeys = keys.filter(key => 
      key.startsWith(CACHE_PREFIXES.USER_PREFIX) || 
      key.startsWith(CACHE_PREFIXES.DROPBOX_PREFIX) ||
      key.startsWith(CACHE_PREFIXES.PREF_PREFIX)
    );
    
    return {
      hasCache: userKeys.length > 0,
      keysCount: userKeys.length,
      keys: userKeys
    };
  };

  const clearLocalShoppingLists = (): number => {
    console.log('🗑️ Clearing local shopping lists (for merge or security)...');
    return clearCacheByPrefix(CACHE_PREFIXES.LOCAL_PREFIX);
  };

  return {
    clearCacheByPrefix,
    clearUserCache,
    clearAppCache,
    clearLocalShoppingLists,
    hasUserCache,
    getUserCacheInfo,
    CACHE_PREFIXES
  };
};

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  CATEGORIES,
  DEFAULT_SITE_SETTINGS,
  PLACEHOLDER_PRODUCTS,
  type CategoryMeta,
  type EnquiryItem,
  type ImageSlotValue,
  type MediaAsset,
  type Product,
  type SiteContent,
  type SiteSettings,
  type VideoAsset,
} from '../types/catalog';
import { SILVER_LINING_PRODUCTS } from '../data/silverLiningProducts';
import { GN_PANS_CATALOG } from '../data/gnPansCatalog';
import { KITCHENWARE_CATALOG } from '../data/kitchenwareCatalog';
import defaultMediaAssetsMap from '../../data/cms/media-assets.json';
import defaultProductsMap from '../../data/cms/products.json';
import defaultSiteContentData from '../../data/cms/site-content.json';
import defaultSettingsData from '../../data/cms/settings.json';

export type SaveActionMode = 'save' | 'save-draft' | 'preview' | 'publish';

const EMPTY_PUBLISHED_CONTENT: SiteContent = {
  id: 'published',
  textOverrides: {},
  extraParagraphs: {},
  imageOverrides: {},
  categoryOverrides: {},
};

const INITIAL_MEDIA_ASSETS: MediaAsset[] = Object.values(
  defaultMediaAssetsMap as unknown as Record<string, MediaAsset>
);

const INITIAL_PRODUCTS: Product[] = Object.values(
  defaultProductsMap as unknown as Record<string, Product>
);

const INITIAL_PUBLISHED_CONTENT: SiteContent = {
  ...EMPTY_PUBLISHED_CONTENT,
  ...(((defaultSiteContentData as unknown as Record<string, unknown>).published as Partial<SiteContent>) || {}),
  id: 'published',
};

const INITIAL_SETTINGS: SiteSettings = {
  ...DEFAULT_SITE_SETTINGS,
  ...(defaultSettingsData as unknown as Partial<SiteSettings>),
  footerConfig: {
    ...(DEFAULT_SITE_SETTINGS.footerConfig || {}),
    ...((defaultSettingsData as unknown as Partial<SiteSettings>).footerConfig || {}),
  },
};

const EMPTY_DRAFT_CONTENT: SiteContent = {
  id: 'draft',
  textOverrides: {},
  extraParagraphs: {},
  imageOverrides: {},
  categoryOverrides: {},
};

function sanitizeSiteContentForFirestore(
  content: SiteContent,
  targetId: 'published' | 'draft'
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: targetId,
    updatedAt: serverTimestamp(),
  };

  if (content.textOverrides && Object.keys(content.textOverrides).length > 0) {
    payload.textOverrides = content.textOverrides;
  } else {
    payload.textOverrides = {};
  }

  if (content.extraParagraphs && Object.keys(content.extraParagraphs).length > 0) {
    payload.extraParagraphs = content.extraParagraphs;
  } else {
    payload.extraParagraphs = {};
  }

  if (content.imageOverrides && Object.keys(content.imageOverrides).length > 0) {
    payload.imageOverrides = content.imageOverrides;
  } else {
    payload.imageOverrides = {};
  }

  if (content.categoryOverrides && Object.keys(content.categoryOverrides).length > 0) {
    payload.categoryOverrides = content.categoryOverrides;
  } else {
    payload.categoryOverrides = {};
  }

  if (content.whyChooseItems) payload.whyChooseItems = content.whyChooseItems;
  if (content.aboutIntroParagraphs) payload.aboutIntroParagraphs = content.aboutIntroParagraphs;
  if (content.aboutBlocks) payload.aboutBlocks = content.aboutBlocks;
  if (content.aboutPhotos) payload.aboutPhotos = content.aboutPhotos;
  if (content.aboutImagePlacement) payload.aboutImagePlacement = content.aboutImagePlacement;
  if (typeof content.logoUrl === 'string') payload.logoUrl = content.logoUrl;
  if (typeof content.logoAlt === 'string') payload.logoAlt = content.logoAlt;
  if (typeof content.logoPosition === 'string') payload.logoPosition = content.logoPosition;
  if (typeof content.logoDeleted === 'boolean') payload.logoDeleted = content.logoDeleted;
  if (typeof content.heroVideoId === 'string') payload.heroVideoId = content.heroVideoId;
  if (typeof content.heroMobileVideoId === 'string') {
    payload.heroMobileVideoId = content.heroMobileVideoId;
  }
  if (typeof content.heroPreviousVideoId === 'string') {
    payload.heroPreviousVideoId = content.heroPreviousVideoId;
  }
  if (typeof content.heroPreviousMobileVideoId === 'string') {
    payload.heroPreviousMobileVideoId = content.heroPreviousMobileVideoId;
  }
  if (typeof content.heroOverlayOpacity === 'number') {
    payload.heroOverlayOpacity = Math.min(0.9, Math.max(0, content.heroOverlayOpacity));
  }
  if (content.heroMediaType === 'image' || content.heroMediaType === 'video') {
    payload.heroMediaType = content.heroMediaType;
  }

  return payload;
}

interface StoreContextValue {
  products: Product[];
  realProducts: Product[];
  loadingProducts: boolean;
  settings: SiteSettings;
  mediaAssets: MediaAsset[];
  videoAssets: VideoAsset[];
  resolveMediaSrc: (src?: string) => string | undefined;
  getAssetUsages: (assetId: string) => string[];
  publishedContent: SiteContent;
  draftContent: SiteContent | null;
  activeContent: SiteContent;
  adminContent: SiteContent;
  editMode: boolean;
  setEditMode: (val: boolean) => void;
  previewMode: boolean;
  setPreviewMode: (val: boolean) => void;
  saveSiteContent: (nextContent: SiteContent, mode: SaveActionMode) => Promise<void>;
  publishCurrentDraft: () => Promise<void>;
  discardDraft: () => Promise<void>;
  saveAllChanges: () => Promise<void>;
  getText: (key: string, defaultValue: string) => string;
  getExtraParagraphs: (key: string) => string[];
  getImageSlot: (
    slotId: string,
    defaultSrc: string,
    defaultAlt?: string,
    defaultFit?: 'cover' | 'contain'
  ) => Required<Pick<ImageSlotValue, 'position' | 'fit' | 'deleted'>> & {
    src: string;
    alt: string;
    mediaType: 'image' | 'video';
    videoId: string;
  };
  categoriesWithOverrides: CategoryMeta[];
  getCategoryDisplay: (categoryId: string) => CategoryMeta;
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  adminMode: boolean;
  toggleAdminMode: (enabled?: boolean) => void;
  isAuthenticatedAdmin: boolean;
  signInAdmin: () => Promise<void>;
  signOutAdmin: () => Promise<void>;
  quoteItems: EnquiryItem[];
  addToQuote: (item: EnquiryItem) => void;
  removeFromQuote: (index: number) => void;
  updateQuoteQuantity: (index: number, quantity: number) => void;
  clearQuote: () => void;
  updateSettings: (partial: Partial<SiteSettings>) => Promise<void>;
  getWhatsAppUrl: (customMessage?: string) => string;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

const QUOTE_STORAGE_KEY = 'sds_quote_items_v1';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [realProducts, setRealProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(INITIAL_SETTINGS);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(INITIAL_MEDIA_ASSETS);
  const [videoAssets, setVideoAssets] = useState<VideoAsset[]>([]);
  const [publishedContent, setPublishedContent] = useState<SiteContent>(INITIAL_PUBLISHED_CONTENT);
  const [draftContent, setDraftContent] = useState<SiteContent | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdminDoc, setIsAdminDoc] = useState(false);

  const [quoteItems, setQuoteItems] = useState<EnquiryItem[]>(() => {
    try {
      const saved = sessionStorage.getItem(QUOTE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(quoteItems));
    } catch {
      // Ignore storage errors
    }
  }, [quoteItems]);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !user.emailVerified) {
      setIsAdminDoc(false);
      return;
    }
    if (user.email === BOOTSTRAPPED_ADMIN_EMAIL) {
      setIsAdminDoc(true);
      return;
    }
    const adminRef = doc(db, 'admins', user.uid);
    const unsubscribe = onSnapshot(
      adminRef,
      (snap) => {
        setIsAdminDoc(snap.exists());
      },
      () => {
        setIsAdminDoc(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  const isAuthenticatedAdmin = Boolean(
    user &&
      user.emailVerified &&
      (user.email === BOOTSTRAPPED_ADMIN_EMAIL || isAdminDoc)
  );

  const [adminMode, setAdminMode] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined') {
        // Clear old persistent admin flag so external browsers are completely clean by default
        localStorage.removeItem('sds_admin_mode_v1');

        const params = new URLSearchParams(window.location.search);
        if (params.get('admin') === 'true' || params.get('admin') === 'secret' || params.get('admin') === 'edit') {
          sessionStorage.setItem('sds_admin_active', 'true');
          return true;
        }
        if (params.get('admin') === 'false') {
          sessionStorage.removeItem('sds_admin_active');
          return false;
        }
        if (window.location.pathname === '/admin') {
          return true;
        }
        return sessionStorage.getItem('sds_admin_active') === 'true';
      }
    } catch {
      // Fallback
    }
    return false;
  });

  const toggleAdminMode = (enabled?: boolean) => {
    setAdminMode((prev) => {
      const nextVal = typeof enabled === 'boolean' ? enabled : !prev;
      try {
        if (nextVal) {
          sessionStorage.setItem('sds_admin_active', 'true');
        } else {
          sessionStorage.removeItem('sds_admin_active');
          localStorage.removeItem('sds_admin_mode_v1');
          setEditMode(false);
        }
      } catch {}
      return nextVal;
    });
  };

  // Keyboard shortcut for owner: Ctrl + Shift + A to toggle Admin Mode
  useEffect(() => {
    const handleAdminKeyCombo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        toggleAdminMode();
      }
    };
    window.addEventListener('keydown', handleAdminKeyCombo);
    return () => window.removeEventListener('keydown', handleAdminKeyCombo);
  }, []);

  const isAdmin = Boolean(
    isAuthenticatedAdmin ||
      adminMode ||
      (typeof window !== 'undefined' && window.location.pathname === '/admin')
  );

  // Cross-browser server synchronization: load media, products & site content from server API
  useEffect(() => {
    // 1. Fetch server media
    fetch('/api/media')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.assets) && data.assets.length > 0) {
          setMediaAssets((prev) => {
            const map = new Map<string, MediaAsset>();
            for (const a of prev) map.set(a.id, a);
            for (const a of data.assets) map.set(a.id, a);
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});

    // 2. Fetch server products
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.products) && data.products.length > 0) {
          setRealProducts((prev) => {
            const map = new Map<string, Product>();
            for (const p of prev) map.set(p.id, p);
            for (const p of data.products) map.set(p.id, p);
            return Array.from(map.values());
          });
          setLoadingProducts(false);
        }
      })
      .catch(() => {});

    // 3. Fetch server site-content
    fetch('/api/site-content')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          if (data.published) {
            setPublishedContent((prev) => ({ ...prev, ...data.published, id: 'published' }));
          }
          if (data.draft) {
            setDraftContent((prev) => ({ ...prev, ...data.draft, id: 'draft' }));
          }
        }
      })
      .catch(() => {});

    // 4. Fetch server settings
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.settings) {
          setSettings((prev) => ({
            ...prev,
            ...data.settings,
            footerConfig: {
              ...(prev.footerConfig || DEFAULT_SITE_SETTINGS.footerConfig),
              ...(data.settings.footerConfig || {}),
            },
          }));
        }
      })
      .catch(() => {});

    // 5. Cleanup obsolete localStorage caches to ensure fresh catalog prices and media load
    try {
      localStorage.removeItem('sds_local_products_v1');
      localStorage.removeItem('sds_local_media_assets_v1');
    } catch {
      // Ignore
    }
  }, []);

  // Turn off admin modes automatically only if isAdmin becomes false
  useEffect(() => {
    if (!isAdmin) {
      setEditMode(false);
      setPreviewMode(false);
    }
  }, [isAdmin]);

  // Products subscription
  useEffect(() => {
    const productsQuery = query(collection(db, 'products'), orderBy('sortOrder', 'asc'));
    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        const items: Product[] = snapshot.docs.map((d) => ({
          ...(d.data() as Product),
          id: d.id,
          isPlaceholder: false,
        }));
        setRealProducts(items);
        setLoadingProducts(false);
      },
      (error) => {
        setLoadingProducts(false);
        try {
          handleFirestoreError(error, OperationType.LIST, 'products');
        } catch {
          // Keep UI resilient
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // Settings subscription
  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'public_profile');
    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setSettings({
            ...DEFAULT_SITE_SETTINGS,
            ...(snapshot.data() as Partial<SiteSettings>),
          });
        }
      },
      () => {
        // Fallback to defaults
      }
    );
    return () => unsubscribe();
  }, []);

  // Central Image Library subscription
  useEffect(() => {
    const mediaQuery = query(collection(db, 'media_assets'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      mediaQuery,
      (snapshot) => {
        const list: MediaAsset[] = snapshot.docs.map((d) => ({
          ...(d.data() as MediaAsset),
          id: d.id,
        }));
        setMediaAssets(list);
      },
      () => {
        // Keep UI resilient if collection empty/offline
      }
    );
    return () => unsubscribe();
  }, []);

  // Permanent Video Assets subscription (metadata only)
  useEffect(() => {
    const videoQuery = query(
      collection(db, 'video_assets'),
      where('status', 'in', ['active', 'archived'])
    );
    const unsubscribe = onSnapshot(
      videoQuery,
      (snapshot) => {
        const list: VideoAsset[] = snapshot.docs
          .map((d) => ({
            ...(d.data() as VideoAsset),
            id: d.id,
          }))
          .sort((a, b) => b.id.localeCompare(a.id));
        setVideoAssets(list);
      },
      () => {
        // Keep UI resilient if collection empty/offline
      }
    );
    return () => unsubscribe();
  }, []);

  // Published site_content subscription
  useEffect(() => {
    const pubRef = doc(db, 'site_content', 'published');
    const unsubscribe = onSnapshot(
      pubRef,
      (snap) => {
        if (snap.exists()) {
          setPublishedContent({
            ...EMPTY_PUBLISHED_CONTENT,
            ...(snap.data() as Partial<SiteContent>),
            id: 'published',
          });
        } else {
          setPublishedContent(EMPTY_PUBLISHED_CONTENT);
        }
      },
      () => {
        // Fallback cleanly to built-in website copy & assets
      }
    );
    return () => unsubscribe();
  }, []);

  // Draft site_content subscription (available in edit mode without sign-in for now)
  useEffect(() => {
    const draftRef = doc(db, 'site_content', 'draft');
    const unsubscribe = onSnapshot(
      draftRef,
      (snap) => {
        if (snap.exists()) {
          setDraftContent({
            ...EMPTY_DRAFT_CONTENT,
            ...(snap.data() as Partial<SiteContent>),
            id: 'draft',
          });
        } else {
          setDraftContent(null);
        }
      },
      () => {
        setDraftContent(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const mediaMap = useMemo(() => {
    const map: Record<string, MediaAsset> = {};
    for (const item of mediaAssets) {
      map[item.id] = item;
    }
    return map;
  }, [mediaAssets]);

  const resolveMediaSrc = (src?: string): string | undefined => {
    if (!src) return undefined;
    if (src.startsWith('media://')) {
      const id = src.slice('media://'.length);
      if (mediaMap[id]?.dataUrl?.startsWith('data:')) {
        return mediaMap[id].dataUrl;
      }
      try {
        const localMap = JSON.parse(localStorage.getItem('sds_local_media_assets_v1') || '{}');
        if (localMap[id]?.dataUrl?.startsWith('data:')) return localMap[id].dataUrl;
      } catch {
        // Ignore storage errors
      }
      if (mediaMap[id]?.dataUrl) {
        return mediaMap[id].dataUrl;
      }
      return `/media/${id}.webp`;
    }
    if (src.startsWith('/src/assets/images/')) {
      return src.replace('/src/assets/images/', '/images/');
    }
    return src;
  };

  const activeContent: SiteContent = useMemo(() => {
    if (isAdmin && previewMode && draftContent) {
      return draftContent;
    }
    return publishedContent;
  }, [isAdmin, previewMode, draftContent, publishedContent]);

  const adminContent: SiteContent = useMemo(() => {
    return draftContent || publishedContent;
  }, [draftContent, publishedContent]);

  const saveSiteContent = async (nextContent: SiteContent, mode: SaveActionMode) => {
    // Also save to server API for instant cross-browser synchronization
    try {
      fetch('/api/site-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: nextContent, mode }),
      }).catch(() => {});
    } catch {
      // Keep resilient
    }

    if (mode === 'save-draft') {
      const draftPayload = sanitizeSiteContentForFirestore(nextContent, 'draft');
      try {
        await setDoc(doc(db, 'site_content', 'draft'), draftPayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'site_content/draft');
      }
      return;
    }

    if (mode === 'preview') {
      const draftPayload = sanitizeSiteContentForFirestore(nextContent, 'draft');
      try {
        await setDoc(doc(db, 'site_content', 'draft'), draftPayload);
        setPreviewMode(true);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'site_content/draft');
      }
      return;
    }

    // Both 'save' and 'publish' persist permanently to Firestore 'published' and sync 'draft'
    const publishedPayload = sanitizeSiteContentForFirestore(nextContent, 'published');
    const draftPayload = sanitizeSiteContentForFirestore(nextContent, 'draft');
    try {
      await setDoc(doc(db, 'site_content', 'published'), publishedPayload);
      await setDoc(doc(db, 'site_content', 'draft'), draftPayload);
      setPreviewMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'site_content/published');
    }
  };

  const publishCurrentDraft = async () => {
    const source = draftContent || publishedContent;
    const publishedPayload = sanitizeSiteContentForFirestore(source, 'published');
    try {
      await setDoc(doc(db, 'site_content', 'published'), publishedPayload);
      setPreviewMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'site_content/published');
    }
  };

  const discardDraft = async () => {
    const syncedDraft = sanitizeSiteContentForFirestore(publishedContent, 'draft');
    try {
      await setDoc(doc(db, 'site_content', 'draft'), syncedDraft);
      setPreviewMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'site_content/draft');
    }
  };

  const saveAllChanges = async () => {
    const source = draftContent || publishedContent;
    const publishedPayload = sanitizeSiteContentForFirestore(source, 'published');
    const draftPayload = sanitizeSiteContentForFirestore(source, 'draft');

    // 1. Sync site content to server API
    try {
      await fetch('/api/site-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: source, mode: 'publish' }),
      });
    } catch {
      // Resilience
    }

    // 2. Sync settings to server API
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
    } catch {
      // Resilience
    }

    // 3. Save to Firestore
    try {
      await setDoc(doc(db, 'site_content', 'published'), publishedPayload);
      await setDoc(doc(db, 'site_content', 'draft'), draftPayload);
      setPublishedContent({ ...source, id: 'published' });
      setDraftContent(null);
      setPreviewMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'site_content/published');
    }
  };

  const getText = (key: string, defaultValue: string): string => {
    const map = activeContent.textOverrides || {};
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      return map[key];
    }
    return defaultValue;
  };

  const getExtraParagraphs = (key: string): string[] => {
    return activeContent.extraParagraphs?.[key] || [];
  };

  const getImageSlot = (
    slotId: string,
    defaultSrc: string,
    defaultAlt = '',
    defaultFit: 'cover' | 'contain' = 'cover'
  ) => {
    const ov = activeContent.imageOverrides?.[slotId];
    return {
      src: ov?.src !== undefined ? ov.src : defaultSrc,
      alt: ov?.alt !== undefined ? ov.alt : defaultAlt,
      position: ov?.position || '50% 50%',
      fit: ov?.fit || defaultFit,
      deleted: Boolean(ov?.deleted),
      mediaType: (ov?.mediaType || 'image') as 'image' | 'video',
      videoId: ov?.videoId || '',
    };
  };

  const categoriesWithOverrides = useMemo(() => {
    const ovMap = activeContent.categoryOverrides || {};
    return CATEGORIES.map((cat) => {
      const ov = ovMap[cat.id];
      if (!ov) return cat;
      return {
        ...cat,
        ...(ov.title !== undefined ? { title: ov.title } : {}),
        ...(ov.navLabel !== undefined ? { navLabel: ov.navLabel } : {}),
        ...(ov.shortDescription !== undefined
          ? { shortDescription: ov.shortDescription }
          : {}),
        ...(ov.fullDescription !== undefined
          ? { fullDescription: ov.fullDescription }
          : {}),
        ...(ov.image !== undefined ? { image: ov.image } : {}),
      };
    });
  }, [activeContent]);

  const getCategoryDisplay = (categoryId: string): CategoryMeta => {
    return (
      categoriesWithOverrides.find((c) => c.id === categoryId) ??
      categoriesWithOverrides[0]
    );
  };

  const products = useMemo(() => {
    const mergedMap = new Map<string, Product>();
    for (const item of KITCHENWARE_CATALOG) {
      mergedMap.set(item.id, item);
    }
    for (const item of GN_PANS_CATALOG) {
      mergedMap.set(item.id, item);
    }
    for (const item of SILVER_LINING_PRODUCTS) {
      mergedMap.set(item.id, item);
    }
    for (const item of realProducts) {
      mergedMap.set(item.id, item);
    }
    try {
      if (editMode) {
        const localMap = JSON.parse(localStorage.getItem('sds_local_products_v1') || '{}');
        for (const item of Object.values(localMap)) {
          if (item && typeof item === 'object' && (item as Product).id) {
            mergedMap.set((item as Product).id, item as Product);
          }
        }
      }
    } catch {
      // Ignore localStorage read errors
    }

    const combined = Array.from(mergedMap.values()).sort(
      (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
    );

    if (!settings.showPlaceholderSlots) {
      return combined;
    }

    const populatedCategories = new Set(combined.map((p) => p.category));
    const missingPlaceholders = PLACEHOLDER_PRODUCTS.filter(
      (p) => !populatedCategories.has(p.category)
    );
    return [...combined, ...missingPlaceholders];
  }, [realProducts, settings.showPlaceholderSlots]);

  const getAssetUsages = (assetId: string): string[] => {
    const ref = `media://${assetId}`;
    const usages: string[] = [];

    const checkContent = (content: SiteContent | null, labelPrefix: string) => {
      if (!content) return;
      if (content.logoUrl === ref && !content.logoDeleted) {
        usages.push(`${labelPrefix}Company Logo`);
      }
      if (content.imageOverrides) {
        for (const [slotId, slotVal] of Object.entries(content.imageOverrides)) {
          if (slotVal?.src === ref && !slotVal.deleted) {
            usages.push(`${labelPrefix}Slot: ${slotId}`);
          }
        }
      }
      if (content.categoryOverrides) {
        for (const [catId, catOv] of Object.entries(content.categoryOverrides)) {
          if (catOv?.image === ref) {
            usages.push(`${labelPrefix}Category: ${catId}`);
          }
        }
      }
      if (content.aboutPhotos) {
        content.aboutPhotos.forEach((p, idx) => {
          if (p.src === ref) {
            usages.push(`${labelPrefix}About Us Photo #${idx + 1}`);
          }
        });
      }
    };

    checkContent(publishedContent, '');
    if (draftContent) checkContent(draftContent, 'Draft · ');

    for (const prod of products) {
      if (prod.mainImage === ref || prod.additionalImages?.includes(ref)) {
        usages.push(`Product: ${prod.name}`);
      }
    }

    return Array.from(new Set(usages));
  };

  const signInAdmin = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signOutAdmin = async () => {
    await signOut(auth);
  };

  const addToQuote = (item: EnquiryItem) => {
    setQuoteItems((prev) => {
      const existingIdx = prev.findIndex(
        (existing) =>
          existing.productName === item.productName &&
          existing.modelOrSize === item.modelOrSize
      );
      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + item.quantity,
        };
        return updated;
      }
      return [...prev, item];
    });
  };

  const removeFromQuote = (index: number) => {
    setQuoteItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateQuoteQuantity = (index: number, quantity: number) => {
    setQuoteItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    );
  };

  const clearQuote = () => {
    setQuoteItems([]);
  };

  const updateSettings = async (partial: Partial<SiteSettings>) => {
    const nextSettings: SiteSettings = {
      ...settings,
      ...partial,
      footerConfig: {
        ...(settings.footerConfig || DEFAULT_SITE_SETTINGS.footerConfig),
        ...(partial.footerConfig || {}),
      },
    };
    setSettings(nextSettings);

    // 1. Sync to server API (persisted to data/cms/settings.json)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: nextSettings }),
      });
    } catch {
      // Resilience
    }

    // 2. Sync to Firestore
    try {
      await setDoc(doc(db, 'settings', 'public_profile'), {
        ...nextSettings,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Resilience
    }
  };

  const getWhatsAppUrl = (customMessage?: string) => {
    const rawPhone =
      settings.whatsappNumber ||
      settings.footerConfig?.whatsappNumber ||
      '919997890127';
    let cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }
    const defaultText =
      customMessage ||
      settings.footerConfig?.whatsappMessage ||
      'Hello SHREE DURGA STEELS, I would like to enquire about your stainless steel products and request a quotation.';
    return `https://wa.me/${cleanPhone || '919997890127'}?text=${encodeURIComponent(defaultText)}`;
  };

  return (
    <StoreContext.Provider
      value={{
        products,
        realProducts,
        loadingProducts,
        settings,
        mediaAssets,
        videoAssets,
        resolveMediaSrc,
        getAssetUsages,
        publishedContent,
        draftContent,
        activeContent,
        adminContent,
        editMode,
        setEditMode,
        previewMode,
        setPreviewMode,
        saveSiteContent,
        publishCurrentDraft,
        discardDraft,
        saveAllChanges,
        getText,
        getExtraParagraphs,
        getImageSlot,
        categoriesWithOverrides,
        getCategoryDisplay,
        user,
        authReady,
        isAdmin,
        adminMode,
        toggleAdminMode,
        isAuthenticatedAdmin,
        signInAdmin,
        signOutAdmin,
        quoteItems,
        addToQuote,
        removeFromQuote,
        updateQuoteQuantity,
        clearQuote,
        updateSettings,
        getWhatsAppUrl,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used inside StoreProvider');
  }
  return ctx;
}

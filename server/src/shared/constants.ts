export const ROLES = ['admin', 'kellner', 'kueche_schank'] as const;

export const TABLE_STATUSES = ['frei', 'besetzt'] as const;

export const AVAILABILITY_MODES = ['sofort', 'lieferzeit'] as const;

export const ORDER_STATUSES = ['offen', 'in_bearbeitung', 'fertig', 'serviert', 'storniert'] as const;

export const ORDER_ITEM_STATUSES = ['neu', 'in_zubereitung', 'fertig', 'serviert', 'storniert'] as const;

export const CATEGORY_TARGETS = ['kueche', 'schank'] as const;

export const DISCOUNT_TYPES = ['percentage', 'fixed'] as const;

export type AppFontFamily =
  | 'system'
  | 'sf_pro'
  | 'sf_rounded'
  | 'be_vietnam'
  | 'jakarta'
  | 'nunito'
  | 'condensed'
  | 'light'
  | 'serif'
  | 'mono';

export interface AppFontOption {
  id: AppFontFamily;
  label: string;
  fontFamilyCss: string;
}

export const SYSTEM_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, "Segoe UI", Roboto, sans-serif';

export const APP_FONT_OPTIONS: AppFontOption[] = [
  {
    id: 'system',
    label: 'Hệ thống',
    fontFamilyCss: SYSTEM_FONT_STACK,
  },
  {
    id: 'sf_pro',
    label: 'SF Pro',
    fontFamilyCss:
      '"SF Pro Text", "SF Pro Display", "YunzySFPro", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    id: 'sf_rounded',
    label: 'SF Rounded',
    fontFamilyCss:
      'ui-rounded, "SF Pro Rounded", "YunzySFRounded", -apple-system, sans-serif',
  },
  {
    id: 'be_vietnam',
    label: 'Be Vietnam',
    fontFamilyCss: '"YunzyBeVietnam", sans-serif',
  },
  {
    id: 'jakarta',
    label: 'Jakarta',
    fontFamilyCss: '"YunzyJakarta", sans-serif',
  },
  {
    id: 'nunito',
    label: 'Nunito',
    fontFamilyCss: '"YunzyNunito", sans-serif',
  },
  {
    id: 'condensed',
    label: 'Gọn',
    fontFamilyCss: '"YunzyCondensed", sans-serif',
  },
  {
    id: 'light',
    label: 'Thanh mảnh',
    fontFamilyCss: '"YunzyBeVietnamLight", sans-serif',
  },
  {
    id: 'serif',
    label: 'Lora Serif',
    fontFamilyCss: '"YunzyLora", Georgia, serif',
  },
  {
    id: 'mono',
    label: 'JetBrains',
    fontFamilyCss:
      '"YunzyJetBrains", ui-monospace, "SF Mono", monospace',
  },
];

export function normalizeFontFamily(value: unknown): AppFontFamily {
  switch (String(value || '').toLowerCase()) {
    case 'sf_pro':
    case 'sfpro':
      return 'sf_pro';
    case 'sf_rounded':
    case 'sfrounded':
      return 'sf_rounded';
    case 'be_vietnam':
    case 'bevietnam':
    case 'sans':
      return 'be_vietnam';
    case 'jakarta':
      return 'jakarta';
    case 'nunito':
      return 'nunito';
    case 'condensed':
      return 'condensed';
    case 'light':
      return 'light';
    case 'serif':
      return 'serif';
    case 'mono':
      return 'mono';
    default:
      return 'system';
  }
}

export function resolveFontStack(font: AppFontFamily): string {
  const found = APP_FONT_OPTIONS.find((item) => item.id === font);
  return found ? found.fontFamilyCss : SYSTEM_FONT_STACK;
}

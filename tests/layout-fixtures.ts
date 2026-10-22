import type { Product } from '../src/types';

// Synthetic stock and quantities; no customer data.
export const fiveProducts: Product[] = [
  { index: 1, name: '測試商品 安全採血針 100支裝 免裝針 免採血筆 可丟垃圾桶', variant: '新版 30G / 1.5mm', sku: '(D2-2)SL-30-15M', quantity: 2 },
  { index: 2, name: '測試商品 安全採血針 100支裝 免裝針 免採血筆 可丟垃圾桶', variant: '新版 23G / 1.8mm', sku: '(D2-3)SL-23-18M', quantity: 4 },
  { index: 3, name: '測試商品 丁腈檢查手套 無粉 藍色 100入盒裝', variant: 'M號 / 一盒', sku: '(A1-12)NITRILE-BLUE-M', quantity: 1 },
  { index: 4, name: '測試商品 獨立包裝酒精棉片 100片入 外出攜帶用', variant: '單片包裝 / 100片', sku: '(B3-5)ALCOHOL-PAD-100', quantity: 3 },
  { index: 5, name: '測試商品 醫療用透氣膠帶 不織布 白色 單捲包裝', variant: '2.5cm × 9m / 白色', sku: '(C4-8)TAPE-WHITE-25', quantity: 5 },
];

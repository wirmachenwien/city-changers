import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Build scripts run from the project root; this must also work in Vite's SSR bundle.
const read = name => JSON.parse(readFileSync(resolve('public/brand-assets', name), 'utf8'));
export const brandRelease = read('release.json');
export const brandAssets = read('catalog.json');
const assetsByFile = new Map(brandAssets.map(asset => [asset.file, asset]));

export function brandAsset(file) {
  const asset = assetsByFile.get(file);
  if (!asset) throw new Error(`Missing brand download in release inventory: ${file}`);
  return asset;
}

export const brandAssetUrl = file => brandAsset(file).download;

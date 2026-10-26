/**
 * Geriye dönük uyumluluk: Ofis artık harici pencerede açılmaz.
 * Ofis / İstasyon Yönetimi, ağaç görünümüne yerleşiktir (`src/ui/office_view.ts`, `tree` içinde [O]).
 */
export function openOfficeTui(onStatus?: (msg: string) => void): void {
  if (onStatus) onStatus('Ofis artık harici pencere açmaz: `tree` görünümünde [O] ile yerleşik Ofis Yönetimi açılır');
}

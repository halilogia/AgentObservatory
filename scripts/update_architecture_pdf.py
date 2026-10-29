#!/usr/bin/env python3
"""
Agent Observatory Mimari Rehberi PDF Senkronizasyon ve Güncelleme Aracı.

Kullanım:
    python scripts/update_architecture_pdf.py --sync
    python scripts/update_architecture_pdf.py --add "Başlık" "Bölüm Açıklaması..."
"""
import sys
import os
import shutil
import argparse
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception as enc_err:
        sys.stderr.write(f"[WARN] Failed to reconfigure stdout encoding: {enc_err}\n")

REPO_ROOT = Path(__file__).resolve().parent.parent
REPO_PDF = REPO_ROOT / "AgentObservatory_Tum_Dosyalar_Mimari_Rehberi.pdf"
DESKTOP_LNK = Path(os.path.expanduser("~")) / "Desktop" / "AgentObservatory_Tum_Dosyalar_Mimari_Rehberi.lnk"
DESKTOP_OLD_PDF = Path(os.path.expanduser("~")) / "Desktop" / "AgentObservatory_Tum_Dosyalar_Mimari_Rehberi.pdf"

def ensure_desktop_shortcut():
    """Masaüstünde doğrudan repodaki PDF'i gösteren Windows kısayolunu (.lnk) sağlar."""
    if not REPO_PDF.exists():
        print(f"[HATA] Kaynak PDF bulunamadı: {REPO_PDF}", file=sys.stderr)
        return False
    
    # Eski mükerrer fiziksel PDF varsa temizle
    if DESKTOP_OLD_PDF.exists():
        try:
            DESKTOP_OLD_PDF.unlink()
        except Exception as del_err:
            sys.stderr.write(f"[UYARI] Eski fiziksel dosya silinemedi: {del_err}\n")

    # Kısayol zaten varsa ve geçerliyse
    if DESKTOP_LNK.exists():
        print(f"✔ Masaüstü kısayolu zaten hazır ve repo PDF'ine bağlı: {DESKTOP_LNK.name}")
        return True

    try:
        import win32com.client
        shell = win32com.client.Dispatch("WScript.Shell")
        shortcut = shell.CreateShortCut(str(DESKTOP_LNK))
        shortcut.Targetpath = str(REPO_PDF)
        shortcut.WorkingDirectory = str(REPO_ROOT)
        shortcut.Description = "Agent Observatory Tüm Dosyalar Mimari Rehberi"
        shortcut.save()
        print(f"✔ Masaüstü kısayolu oluşturuldu: {DESKTOP_LNK.name} -> {REPO_PDF.name}")
        return True
    except Exception as sc_err:
        sys.stderr.write(f"[UYARI] Kısayol oluşturulamadı: {sc_err}\n")
        return False

def sync_copies():
    return ensure_desktop_shortcut()

def add_section(title: str, body: str, subtitle: str = "Mimari ve Kod Değişikliği Güncellemesi"):
    """PDF sonuna yeni bir zeyilname / mimari güncelleme sayfası ekler."""
    try:
        from io import BytesIO
        from pypdf import PdfReader, PdfWriter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib import colors
    except ImportError as e:
        print(f"[HATA] Gerekli Python kütüphaneleri eksik (pypdf, reportlab): {e}", file=sys.stderr)
        return False

    if not REPO_PDF.exists():
        print(f"[HATA] Güncellenecek PDF bulunamadı: {REPO_PDF}", file=sys.stderr)
        return False

    buf = BytesIO()
    styles = getSampleStyleSheet()
    styles['Title'].textColor = colors.HexColor('#16324f')
    
    items = [
        Paragraph(title, styles['Title']),
        Paragraph(subtitle, styles['Heading2']),
        Spacer(1, 10),
        Paragraph(body, styles['BodyText'])
    ]

    SimpleDocTemplate(
        buf,
        pagesize=(595.28, 841.89),
        leftMargin=44,
        rightMargin=44,
        topMargin=35,
        bottomMargin=35
    ).build(items)

    writer = PdfWriter()
    writer.append(PdfReader(REPO_PDF))
    writer.append(PdfReader(buf))

    tmp_out = REPO_PDF.with_suffix(".tmp.pdf")
    with tmp_out.open("wb") as f:
        writer.write(f)
    tmp_out.replace(REPO_PDF)

    reader = PdfReader(REPO_PDF)
    print(f"✔ PDF güncellendi! Yeni toplam sayfa: {len(reader.pages)}")
    sync_copies()
    return True

def main():
    parser = argparse.ArgumentParser(description="Agent Observatory Mimari PDF Senkronizasyonu")
    parser.add_argument("--sync", action="store_true", help="Repo ve masaüstü kopyalarını eşitler")
    parser.add_argument("--add", nargs=2, metavar=("BASLIK", "METIN"), help="PDF sonuna yeni mimari bölüm ekler")
    args = parser.parse_args()

    if args.add:
        add_section(args.add[0], args.add[1])
    else:
        sync_copies()

if __name__ == "__main__":
    main()

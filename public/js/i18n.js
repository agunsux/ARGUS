/**
 * Tikum — Client-Side Localization (i18n) & Theme Controller
 * 
 * BRAND: Tikum — Verified Ticket Marketplace by Shinerva
 * ENGINE: Powered by ARGUS Trust Engine
 * 
 * Standards:
 * - Default Language: Indonesian ('id')
 * - Default Theme: Dark ('dark')
 * - Persisted in localStorage ('tikum_lang', 'tikum_theme')
 * - Covers all user-visible UI strings, form labels, errors, and status states
 */

(function () {
  const translations = {
    id: {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Ticket Marketplace',
        slogan: 'Tiket terverifikasi. Transaksi terlindungi.',
        engineNote: 'Infrastruktur keamanan & penjaminan ditenagai oleh ARGUS Trust Engine.',
        copyright: '© 2026 Tikum — A Shinerva Company. Seluruh hak cipta dilindungi undang-undang.'
      },
      nav: {
        home: 'Beranda',
        marketplace: 'Katalog Event',
        sell: 'Jual Tiket',
        track: 'Lacak Pesanan',
        offers: 'Penawaran',
        faq: 'FAQ',
        terms: 'Syarat & Ketentuan',
        refund: 'Kebijakan Refund',
        contact: 'Kontak',
        privacy: 'Privasi',
        login: 'Masuk',
        themeDark: 'Mode Gelap',
        themeLight: 'Mode Terang'
      },
      status: {
        LISTED: 'Tersedia di Tikum',
        LOCKED: 'Terkunci (Dalam Transaksi)',
        SOLD: 'Terjual',
        PENDING_PAYMENT: 'Menunggu Pembayaran',
        PAID: 'Dana Diamankan di Escrow',
        ENTRY_CONFIRMED: 'Sukses Masuk Venue',
        SETTLED: 'Selesai & Dicairkan',
        DISPUTED: 'Dalam Investigasi PIC Gate',
        REFUNDED: 'Dana Dikembalikan',
        CANCELLED: 'Dibatalkan',
        PENDING: 'Menunggu Tanggapan',
        ACCEPTED: 'Disepakati',
        REJECTED: 'Ditolak',
        COUNTERED: 'Penawaran Balasan',
        EXPIRED: 'Kedaluwarsa'
      },
      common: {
        loading: 'Memuat data...',
        searchPlaceholder: 'Cari artis, nama event, atau lokasi...',
        filter: 'Saring',
        allCities: 'Semua Kota',
        allCategories: 'Semua Kategori',
        buyNow: 'Beli Sekarang',
        makeOffer: 'Ajukan Tawaran',
        details: 'Detail',
        back: 'Kembali',
        submit: 'Kirim',
        save: 'Simpan',
        cancel: 'Batal',
        confirm: 'Konfirmasi',
        close: 'Tutup',
        emptyEvents: 'Tidak ada event yang ditemukan untuk filter ini.',
        emptyListings: 'Belum ada tiket terverifikasi untuk kategori ini.',
        verifiedBadge: 'Terverifikasi oleh Tikum',
        escrowBadge: 'Escrow Terjamin',
        picBadge: 'Didampingi PIC Gate',
        errorGeneric: 'Terjadi kesalahan sistem. Silakan coba beberapa saat lagi.',
        errorNotFound: 'Data tidak ditemukan.',
        networkError: 'Koneksi jaringan terputus. Periksa sambungan internet Anda.'
      },
      footer: {
        businessTitle: 'Tikum — by Shinerva',
        businessDesc: 'Marketplace tiket sekunder terverifikasi. Transaksi aman dengan rekening penampungan internal (escrow) dan pendampingan fisik di gerbang venue. Infrastruktur keamanan dan penjaminan ditenagai oleh ARGUS Trust Engine.',
        contactTitle: 'Kontak Resmi',
        legalTitle: 'Layanan & Legalitas',
        emailLabel: 'Email:',
        waLabel: 'WhatsApp:',
        addressTitle: 'Kantor Operasional & Surat:'
      }
    },
    en: {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Ticket Marketplace',
        slogan: 'Verified tickets. Real people. Real protection.',
        engineNote: 'Trust & security infrastructure powered by ARGUS Trust Engine.',
        copyright: '© 2026 Tikum — A Shinerva Company. All rights reserved.'
      },
      nav: {
        home: 'Home',
        marketplace: 'Event Catalog',
        sell: 'Sell Ticket',
        track: 'Track Order',
        offers: 'Offers',
        faq: 'FAQ',
        terms: 'Terms of Service',
        refund: 'Refund Policy',
        contact: 'Contact',
        privacy: 'Privacy',
        login: 'Login',
        themeDark: 'Dark Mode',
        themeLight: 'Light Mode'
      },
      status: {
        LISTED: 'Available on Tikum',
        LOCKED: 'Locked (In Transaction)',
        SOLD: 'Sold',
        PENDING_PAYMENT: 'Pending Payment',
        PAID: 'Funds Secured in Escrow',
        ENTRY_CONFIRMED: 'Venue Entry Confirmed',
        SETTLED: 'Completed & Paid Out',
        DISPUTED: 'Under Gate PIC Investigation',
        REFUNDED: 'Funds Refunded',
        CANCELLED: 'Cancelled',
        PENDING: 'Pending Response',
        ACCEPTED: 'Offer Accepted',
        REJECTED: 'Offer Rejected',
        COUNTERED: 'Counter-Offered',
        EXPIRED: 'Offer Expired'
      },
      common: {
        loading: 'Loading data...',
        searchPlaceholder: 'Search artist, event, or venue...',
        filter: 'Filter',
        allCities: 'All Cities',
        allCategories: 'All Categories',
        buyNow: 'Buy Now',
        makeOffer: 'Make Offer',
        details: 'Details',
        back: 'Back',
        submit: 'Submit',
        save: 'Save',
        cancel: 'Cancel',
        confirm: 'Confirm',
        close: 'Close',
        emptyEvents: 'No events found matching your search filter.',
        emptyListings: 'No verified tickets currently listed for this category.',
        verifiedBadge: 'Tikum Verified',
        escrowBadge: 'Secured Escrow',
        picBadge: 'Venue PIC Escort',
        errorGeneric: 'A system error occurred. Please try again later.',
        errorNotFound: 'Data not found.',
        networkError: 'Network disconnected. Please check your internet connection.'
      },
      footer: {
        businessTitle: 'Tikum — by Shinerva',
        businessDesc: 'Verified secondary ticket marketplace. Safe transactions backed by an internal escrow lock and real on-site assistance at venue turnstiles. Trust and security infrastructure powered by ARGUS Trust Engine.',
        contactTitle: 'Official Contact',
        legalTitle: 'Services & Legal',
        emailLabel: 'Email:',
        waLabel: 'WhatsApp:',
        addressTitle: 'Operational & Mailing Address:'
      }
    }
  };

  // State
  let currentLang = localStorage.getItem('tikum_lang') || 'id';
  let currentTheme = localStorage.getItem('tikum_theme') || 'dark';

  function t(path, fallback = '') {
    const parts = path.split('.');
    let obj = translations[currentLang];
    for (const p of parts) {
      if (obj && obj[p] !== undefined) {
        obj = obj[p];
      } else {
        // Fallback to Indonesian if key missing in EN
        let fallbackObj = translations.id;
        for (const fp of parts) {
          if (fallbackObj && fallbackObj[fp] !== undefined) {
            fallbackObj = fallbackObj[fp];
          } else {
            return fallback || path;
          }
        }
        return fallbackObj || fallback || path;
      }
    }
    return obj;
  }

  function applyLanguage(lang) {
    if (!translations[lang]) lang = 'id';
    currentLang = lang;
    localStorage.setItem('tikum_lang', lang);
    document.documentElement.lang = lang;

    // Translate DOM elements marked with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (val) {
        if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search')) {
          el.placeholder = val;
        } else {
          el.textContent = val;
        }
      }
    });

    // Translate attributes marked with data-i18n-attr (e.g. placeholder)
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = t(key);
      if (val) el.placeholder = val;
    });

    // Update language switch button text if present
    const langBtn = document.getElementById('btnLangToggle');
    if (langBtn) {
      langBtn.innerHTML = `<i class="fa-solid fa-globe"></i> ${currentLang === 'id' ? 'EN' : 'ID'}`;
    }
  }

  function applyTheme(theme) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    localStorage.setItem('tikum_theme', currentTheme);
    if (currentTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    const themeBtn = document.getElementById('btnThemeToggle');
    if (themeBtn) {
      themeBtn.innerHTML = currentTheme === 'light' 
        ? '<i class="fa-solid fa-moon"></i>' 
        : '<i class="fa-solid fa-sun"></i>';
      themeBtn.title = currentTheme === 'light' ? t('nav.themeDark') : t('nav.themeLight');
    }
  }

  function toggleLanguage() {
    applyLanguage(currentLang === 'id' ? 'en' : 'id');
  }

  function toggleTheme() {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  // Auto initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyTheme(currentTheme);
      applyLanguage(currentLang);
    });
  } else {
    applyTheme(currentTheme);
    applyLanguage(currentLang);
  }

  window.TikumI18n = {
    t,
    getLang: () => currentLang,
    getTheme: () => currentTheme,
    setLang: applyLanguage,
    setTheme: applyTheme,
    toggleLang: toggleLanguage,
    toggleTheme: toggleTheme,
    translations
  };
})();

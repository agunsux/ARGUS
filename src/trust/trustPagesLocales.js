'use strict';

const { normalizeLocale } = require('../i18n');

function pickLocale(map, lang) {
  const loc = normalizeLocale(lang);
  return map[loc] || map.en || map.id;
}

const TRUST_PAGES_CONTENT = {
  howItWorks: {
    id: {
      title: 'Cara Kerja Tikum — Transaksi Tiket Aman dengan Escrow & Verifikasi | Tikum',
      description: 'Pelajari mekanisme transaksi tiket konser dan event di Tikum: mulai dari pendaftaran tiket, pembayaran escrow, verifikasi gerbang venue, hingga pencairan dana aman.',
      h1: 'Bagaimana Tikum Melindungi Transaksi Anda',
      subtitle: 'Alur transaksi tiket konser dan event langsung yang dirancang dengan perlindungan escrow dan verifikasi gerbang.',
      breadcrumb: 'Cara Kerja',
      steps: [
        { title: 'Penjual Mendaftarkan Tiket Terverifikasi', desc: 'Penjual mengunggah bukti e-voucher asli, nomor barcode unik, dan kategori tempat duduk. Sistem Tikum memvalidasi format data dan mencegah duplikasi tiket yang sama didaftarkan berkali-kali.' },
        { title: 'Pembeli Membayar Melalui Perlindungan Platform-Held', desc: 'Dana pembayaran dikelola dengan sistem penahanan transaksi administratif platform (platform-held). Uang <strong>tidak langsung dikirim</strong> kepada penjual sampai serah terima dan validasi tiket terpenuhi.' },
        { title: 'Penyerahan Tiket & Verifikasi Akses Gerbang', desc: 'Pembeli menerima dokumen e-voucher atau panduan penukaran wristband fisik. Untuk event tertentu dengan penugasan operasional resmi, koordinator lapangan (Event PIC) disiagakan untuk mendokumentasikan kendala tiket.' },
        { title: 'Penyelesaian Transaksi & Pencairan Penjual', desc: 'Setelah validasi tiket selesai atau berakhirnya batas waktu verifikasi tanpa ada sengketa (dispute), dana diteruskan ke rekening penjual.' }
      ],
      faqs: [
        { q: 'Apakah Tikum menjual tiket langsung sebagai promotor?', a: 'Bukan. Tikum adalah marketplace sekunder terverifikasi yang menyediakan infrastruktur escrow dan perlindungan transaksi antar penggemar acara langsung.' },
        { q: 'Kapan dana saya dicairkan jika saya seorang penjual?', a: 'Dana dicairkan setelah pembeli berhasil terverifikasi masuk ke lokasi acara atau jendela verifikasi berakhir tanpa adanya klaim dispute.' }
      ]
    },
    en: {
      title: 'How Tikum Works — Safe Ticket Transactions with Escrow & Gate Verification | Tikum',
      description: 'Learn how concert and live event ticket transactions work on Tikum: verified listing, platform-held protection, gate verification, and secure settlement.',
      h1: 'How Tikum Protects Your Transactions',
      subtitle: 'A concert and live event ticket flow built with neutral platform-held custody and physical gate verification.',
      breadcrumb: 'How It Works',
      steps: [
        { title: 'Sellers List Verified Tickets', desc: 'Sellers upload genuine e-voucher proofs, unique barcode identifiers, and seat categories. Tikum validates data structure and prevents duplicate ticket submissions.' },
        { title: 'Buyers Pay via Platform-Held Protection', desc: 'Buyer transactions are safeguarded by platform-held control. Funds are <strong>not disbursed to the seller</strong> until the ticket verification and handover requirements are satisfied.' },
        { title: 'Ticket Handover & Gate Verification', desc: 'Buyers receive digital e-voucher documents or official wristband exchange instructions. For select events with active assignments, on-site Event PIC coordinators assist with documentation.' },
        { title: 'Transaction Settlement & Seller Payout', desc: 'Following successful ticket validation or expiration of the review window without dispute, proceeds are disbursed to the seller.' }
      ],
      faqs: [
        { q: 'Does Tikum sell tickets directly as a promoter?', a: 'No. Tikum is a verified secondary marketplace providing transaction protection infrastructure between live event fans.' },
        { q: 'When are funds released if I am a seller?', a: 'Funds are disbursed after the buyer is verified through the venue gate or after the post-event dispute window closes without claims.' }
      ]
    },
    ms: {
      title: 'Cara Tikum Berfungsi — Transaksi Tiket Selamat & Pengesahan | Tikum',
      description: 'Ketahui bagaimana transaksi tiket konsert dan acara langsung berfungsi di Tikum: penyenaraian terbukti, perlindungan pegangan platform, pengesahan pintu masuk dan penyelesaian selamat.',
      h1: 'Bagaimana Tikum Melindungi Transaksi Anda',
      subtitle: 'Aliran transaksi tiket konsert dan acara langsung yang direka dengan pegangan platform neutral dan pengesahan pintu masuk.',
      breadcrumb: 'Cara Berfungsi',
      steps: [
        { title: 'Penjual Menyenaraikan Tiket Terbukti', desc: 'Penjual memuat naik bukti e-baucar asal, pengecam kod bar unik, dan kategori tempat duduk. Sistem Tikum menentusahkan format dan menghalang penduaan tiket.' },
        { title: 'Pembeli Membayar Melalui Perlindungan Pegangan Platform', desc: 'Dana pembayaran diurus melalui kawalan pentadbiran platform (platform-held). Wang <strong>tidak dihantar terus</strong> kepada penjual sehingga pengesahan dan serahan tiket selesai.' },
        { title: 'Serahan Tiket & Pengesahan Pintu Masuk', desc: 'Pembeli menerima dokumen e-baucar atau arahan penukaran gelang tangan rasmi. Untuk acara terpilih, penyelaras lapangan (Event PIC) sedia membantu dokumentasi di lokasi.' },
        { title: 'Penyelesaian Transaksi & Bayaran Penjual', desc: 'Selepas pengesahan tiket selesai atau tempoh semakan berakhir tanpa pertikaian, hasil jualan disalurkan ke akaun bank penjual.' }
      ],
      faqs: [
        { q: 'Adakah Tikum menjual tiket terus sebagai penganjur?', a: 'Tidak. Tikum ialah pasaran tiket sekunder terbukti yang menyediakan infrastruktur perlindungan transaksi antara peminat acara.' },
        { q: 'Bilakah dana dilepaskan jika saya penjual?', a: 'Dana disalurkan selepas pembeli disahkan memasuki lokasi acara atau tetingkap semakan pasca-acara tamat tanpa tuntutan pertikaian.' }
      ]
    },
    tl: {
      title: 'Paano Gumagana ang Tikum — Ligtas na Transaksyon at Beripikasyon | Tikum',
      description: 'Alamin kung paano gumagana ang transaksyon ng tiket sa Tikum: beripikadong listing, proteksyong hawak ng platform, beripikasyon sa gate, at ligtas na payout.',
      h1: 'Paano Pinoprotektahan ng Tikum ang Iyong mga Transaksyon',
      subtitle: 'Daloy ng transaksyon ng tiket na binuo gamit ang proteksyong hawak ng platform at pisikal na beripikasyon sa gate.',
      breadcrumb: 'Paano Ito Gumagana',
      steps: [
        { title: 'Naglilista ang Nagbebenta ng Beripikadong Tiket', desc: 'Nag-a-upload ang nagbebenta ng orihinal na e-voucher proof, natatanging barcode, at kategorya ng upuan. Pinipigilan ng sistema ng Tikum ang dobleng paglilista.' },
        { title: 'Nagbabayad ang Mamimili sa Proteksyong Hawak ng Platform', desc: 'Ang bayad ay pinoprotektahan sa ilalim ng administratibong pangangalaga ng platform. Ang pondo ay <strong>hindi agad ipinapadala</strong> sa nagbebenta hanggang matapos ang beripikasyon.' },
        { title: 'Paglipat ng Tiket at Beripikasyon sa Gate', desc: 'Natatanggap ng mamimili ang e-voucher o gabay sa pagkuha ng wristband. Para sa mga piling kaganapan, tumutulong ang Event PIC sa venue.' },
        { title: 'Settlement ng Transaksyon at Payout sa Nagbebenta', desc: 'Matapos ang beripikasyon o paglipas ng panahon ng pagsusuri nang walang alitan, ilalabas ang pondo sa account ng nagbebenta.' }
      ],
      faqs: [
        { q: 'Direkta bang nagbebenta ng tiket ang Tikum bilang promoter?', a: 'Hindi. Ang Tikum ay isang beripikadong secondary marketplace na nagbibigay ng imprastraktura para sa ligtas na transaksyon ng mga tagahanga.' },
        { q: 'Kailan ilalabas ang pondo kung ako ang nagbebenta?', a: 'Ilalabas ang pondo matapos makumpirma ang pagpasok ng mamimili o matapos ang post-event review window nang walang dispute.' }
      ]
    },
    th: {
      title: 'วิธีการทำงานของ Tikum — ซื้อขายบัตรปลอดภัยพร้อมระบบตรวจสอบ | Tikum',
      description: 'เรียนรู้ขั้นตอนการซื้อขายบัตรคอนเสิร์ตและงานอีเวนต์บน Tikum ตั้งแต่การลงรายการบัตร ระบบพักเงินโดยแพลตฟอร์ม การตรวจสอบที่ประตูงาน จนถึงการโอนเงินอย่างปลอดภัย',
      h1: 'Tikum คุ้มครองธุรกรรมของคุณอย่างไร',
      subtitle: 'ขั้นตอนการซื้อขายบัตรงานอีเวนต์ที่ออกแบบพร้อมระบบพักเงินภายใต้การดูแลของแพลตฟอร์มและการตรวจสอบที่ประตูทางเข้า',
      breadcrumb: 'วิธีการทำงาน',
      steps: [
        { title: 'ผู้ขายลงรายการบัตรที่ผ่านการตรวจสอบ', desc: 'ผู้ขายอัปโหลดหลักฐาน e-voucher ตัวจริง หมายเลขบาร์โค้ดเฉพาะ และประเภทที่นั่ง ระบบ Tikum ตรวจสอบรูปแบบข้อมูลและป้องกันการลงรายการบัตรซ้ำ' },
        { title: 'ผู้ซื้อชำระเงินผ่านระบบพักเงินของแพลตฟอร์ม', desc: 'ยอดชำระจะถูกดูแลภายใต้การควบคุมของแพลตฟอร์ม (platform-held) เงินจะ<strong>ไม่ถูกโอนให้ผู้ขายทันที</strong>จนกว่าจะผ่านเงื่อนไขการส่งมอบและตรวจสอบบัตร' },
        { title: 'การส่งมอบบัตรและการตรวจสอบที่ประตูงาน', desc: 'ผู้ซื้อได้รับเอกสาร e-voucher หรือคำแนะนำการแลกสายรัดข้อมือทางการ สำหรับอีเวนต์ที่ร่วมรายการ เจ้าหน้าที่ Event PIC จะช่วยประสานงานและบันทึกหลักฐานหน้างาน' },
        { title: 'การปิดบัญชีธุรกรรมและจ่ายเงินให้ผู้ขาย', desc: 'เมื่อการตรวจสอบบัตรเสร็จสมบูรณ์หรือพ้นระยะเวลาตรวจสอบหลังจบงานโดยไม่มีข้อพิพาท เงินรายได้จะถูกโอนเข้าบัญชีผู้ขาย' }
      ],
      faqs: [
        { q: 'Tikum เป็นผู้จัดงานที่จำหน่ายบัตรโดยตรงหรือไม่?', a: 'ไม่ใช่ Tikum เป็นตลาดซื้อขายบัตรมือสองที่ผ่านการตรวจสอบ โดยให้บริการโครงสร้างพื้นฐานการคุ้มครองธุรกรรมระหว่างแฟนงานอีเวนต์' },
        { q: 'ผู้ขายจะได้รับเงินเมื่อใด?', a: 'เงินจะถูกโอนออกหลังจากผู้ซื้อเข้างานสำเร็จหรือสิ้นสุดช่วงเวลาตรวจสอบข้อพิพาทหลังจบงานโดยไม่มีคำร้องเรียน' }
      ]
    }
  },
  sellerProtection: {
    id: {
      title: 'Perlindungan Penjual — Penahanan Dana Platform & Transaksi Aman | Tikum',
      description: 'Jual tiket konser dan event dengan tenang di Tikum: penahanan pembayaran terkelola platform sebelum kirim tiket, perlindungan dari penipuan pembeli, dan transfer dana transparan.',
      h1: 'Perlindungan Transaksi untuk Penjual Tiket',
      subtitle: 'Jual tiket yang tidak terpakai dengan sistem penahanan pembayaran terkelola platform dan bebas klaim palsu.',
      breadcrumb: 'Perlindungan Penjual',
      cards: [
        { color: '#10b981', icon: 'fa-money-bill-transfer', title: 'Perlindungan Penahanan Pembayaran Platform', body: 'Anda hanya mengirimkan dokumen tiket setelah pembayaran pembeli terverifikasi berhasil oleh gateway dan tercatat dalam sistem penahanan platform (platform-held). Tidak ada risiko pembeli kabur atau bukti transfer palsu.' },
        { color: '#38bdf8', icon: 'fa-file-shield', title: 'Perlindungan dari Klaim Palsu Pembeli', body: 'Klaim pembeli hanya dapat diproses dengan bukti fisik penolakan turnstile resmi promotor atau verifikasi Event PIC. Pembeli tidak dapat membatalkan pesanan sepihak tanpa bukti sah.' }
      ],
      faqs: [
        { q: 'Berapa lama waktu pencairan dana ke rekening bank penjual?', a: 'Setelah pembeli terverifikasi masuk atau melewati batas waktu pasca-acara (maksimal 24 jam setelah acara selesai), dana langsung ditransfer ke rekening bank penjual.' },
        { q: 'Apakah penjual harus menyerahkan KTP fisik?', a: 'Sesuai protokol acara, jika tiket membutuhkan surat kuasa penukaran, penjual wajib menyediakan dokumen pendukung resmi yang aman.' }
      ]
    },
    en: {
      title: 'Seller Protection — Platform-Held Settlement & Safe Ticket Selling | Tikum',
      description: 'Sell unused concert and event tickets safely: verified platform-held funding before ticket handover, fraud protection against false claims, and prompt bank payout.',
      h1: 'Transaction Protection for Ticket Sellers',
      subtitle: 'Sell unused tickets with platform-held funding protection and safeguard against baseless claims.',
      breadcrumb: 'Seller Protection',
      cards: [
        { color: '#10b981', icon: 'fa-money-bill-transfer', title: 'Platform-Held Payment Protection', body: 'You only transfer ticket credentials after the buyer has completed payment into the platform-held transaction system. Zero risk of phantom transfers or unpaid handovers.' },
        { color: '#38bdf8', icon: 'fa-file-shield', title: 'Protection Against Baseless Buyer Claims', body: 'Dispute claims require authentic turnstile rejection slips or on-site Event PIC verification. Buyers cannot cancel unilaterally without objective evidence.' }
      ],
      faqs: [
        { q: 'How fast are seller proceeds disbursed?', a: 'Once entry is verified or the post-event review window elapses (maximum 24 hours post-event), funds are disbursed directly to your registered bank account.' },
        { q: 'Do sellers have to provide physical national ID (KTP)?', a: 'When event promoters require power of attorney for wristband collection, sellers provide authorized encrypted delegation documents.' }
      ]
    },
    ms: {
      title: 'Perlindungan Penjual — Pegangan Dana Platform & Jualan Selamat | Tikum',
      description: 'Jual tiket konsert yang tidak digunakan dengan selamat di Tikum: dana pegangan platform disahkan sebelum serahan tiket dan perlindungan daripada tuntutan palsu.',
      h1: 'Perlindungan Transaksi untuk Penjual Tiket',
      subtitle: 'Jual tiket anda dengan perlindungan dana pegangan platform dan kawalan terhadap tuntutan tidak berasas.',
      breadcrumb: 'Perlindungan Penjual',
      cards: [
        { color: '#10b981', icon: 'fa-money-bill-transfer', title: 'Perlindungan Pegangan Pembayaran Platform', body: 'Anda hanya menyerahkan kelayakan tiket selepas pembayaran pembeli disahkan dalam sistem pegangan platform. Tiada risiko resit palsu atau serahan tidak berbayar.' },
        { color: '#38bdf8', icon: 'fa-file-shield', title: 'Perlindungan Daripada Tuntutan Palsu Pembeli', body: 'Tuntutan pertikaian memerlukan bukti penolakan pengimbas pintu masuk rasmi atau pengesahan Event PIC. Pembeli tidak boleh membatalkan pesanan secara sebelah pihak tanpa bukti sah.' }
      ],
      faqs: [
        { q: 'Berapa lamakah masa pembayaran ke akaun bank penjual?', a: 'Setelah kemasukan disahkan atau tetingkap semakan 24 jam pasca-acara tamat tanpa pertikaian, dana dipindahkan ke akaun bank berdaftar anda.' },
        { q: 'Perlukah penjual menyerahkan kad pengenalan fizikal?', a: 'Apabila penganjur memerlukan surat kuasa penukaran gelang tangan, penjual menyediakan dokumen perwakilan disulitkan yang sah.' }
      ]
    },
    tl: {
      title: 'Proteksyon ng Nagbebenta — Ligtas na Pagbebenta ng Tiket | Tikum',
      description: 'Ibenta ang hindi nagamit na tiket sa konsyerto nang ligtas sa Tikum gamit ang proteksyon ng pondo sa platform at depensa laban sa walang basehang reklamo.',
      h1: 'Proteksyon sa Transaksyon para sa mga Nagbebenta ng Tiket',
      subtitle: 'Magbenta ng tiket nang may proteksyon sa bayad na hawak ng platform at proteksyon laban sa maling pag-aangkin.',
      breadcrumb: 'Proteksyon ng Nagbebenta',
      cards: [
        { color: '#10b981', icon: 'fa-money-bill-transfer', title: 'Proteksyon sa Bayad na Hawak ng Platform', body: 'Ipapadala mo lamang ang tiket matapos makumpirma ng gateway ang bayad ng mamimili sa sistema ng platform. Walang panganib ng pekeng resibo.' },
        { color: '#38bdf8', icon: 'fa-file-shield', title: 'Proteksyon Laban sa Walang Basehang Reklamo', body: 'Ang mga reklamo ng alitan ay nangangailangan ng opisyal na turnstile rejection evidence o beripikasyon ng Event PIC. Hindi makakapagkansela ang mamimili nang walang ebidensya.' }
      ],
      faqs: [
        { q: 'Gaano kabilis ipinapadala ang kita ng nagbebenta?', a: 'Kapag nakumpirma ang pagpasok o lumipas ang 24-oras na review window nang walang reklamo, direkta itong ipinapadala sa iyong nakarehistrong bank account.' },
        { q: 'Kailangan bang ibigay ng nagbebenta ang pisikal na ID?', a: 'Kung humihingi ang organizer ng authorization letter para sa wristband pickup, nagbibigay lamang ang nagbebenta ng naka-encrypt na dokumento.' }
      ]
    },
    th: {
      title: 'การคุ้มครองผู้ขาย — ระบบพักเงินและขายบัตรอย่างปลอดภัย | Tikum',
      description: 'ขายบัตรคอนเสิร์ตและอีเวนต์อย่างมั่นใจบน Tikum ด้วยระบบตรวจสอบยอดชำระก่อนส่งมอบบัตรและมาตรการป้องกันการเคลมเท็จ',
      h1: 'การคุ้มครองธุรกรรมสำหรับผู้ขายบัตร',
      subtitle: 'ขายบัตรที่ไม่ได้ใช้ด้วยระบบพักเงินภายใต้การควบคุมของแพลตฟอร์มและหลักฐานป้องกันข้อพิพาทที่ไม่เป็นธรรม',
      breadcrumb: 'การคุ้มครองผู้ขาย',
      cards: [
        { color: '#10b981', icon: 'fa-money-bill-transfer', title: 'การคุ้มครองเงินชำระโดยแพลตฟอร์ม', body: 'คุณจะส่งมอบบัตรหลังจากที่ระบบยืนยันการชำระเงินของผู้ซื้อผ่านเกตเวย์เรียบร้อยแล้วเท่านั้น ลดความเสี่ยงจากสลิปปลอมหรือการไม่ชำระเงิน' },
        { color: '#38bdf8', icon: 'fa-file-shield', title: 'การป้องกันการร้องเรียนเท็จจากผู้ซื้อ', body: 'คำร้องข้อพิพาทต้องมีหลักฐานการปฏิเสธจากเครื่องสแกนประตูทางเข้าจริงหรือการยืนยันจากเจ้าหน้าที่ Event PIC ผู้ซื้อไม่สามารถยกเลิกฝ่ายเดียวโดยไม่มีหลักฐานได้' }
      ],
      faqs: [
        { q: 'ใช้เวลานานเท่าใดในการโอนเงินเข้าบัญชีธนาคารผู้ขาย?', a: 'เมื่อผู้ซื้อเข้างานสำเร็จหรือพ้นระยะเวลาตรวจสอบหลังจบงาน (ไม่เกิน 24 ชั่วโมงหลังจบงาน) เงินจะถูกโอนเข้าบัญชีธนาคารที่ลงทะเบียนไว้ทันที' },
        { q: 'ผู้ขายจำเป็นต้องส่งมอบบัตรประชาชนตัวจริงหรือไม่?', a: 'หากผู้จัดงานกำหนดให้ใช้หนังสือมอบอำนาจในการแลกสายรัดข้อมือ ผู้ขายจะส่งเฉพาะเอกสารมอบอำนาจที่เข้ารหัสอย่างปลอดภัยผ่านระบบเท่านั้น' }
      ]
    }
  },
  ticketVerification: {
    id: {
      title: 'Standar Verifikasi Tiket Konser & Event | Tikum',
      description: 'Pelajari standar verifikasi tiket di Tikum: validasi barcode digital, penukaran wristband gelang RFID fisik, surat kuasa resmi, dan pendampingan Event PIC di lokasi.',
      h1: 'Standar & Protokol Verifikasi Tiket',
      subtitle: 'Pemeriksaan berlapis untuk memastikan setiap tiket sah dan diterima di pintu gerbang venue.',
      breadcrumb: 'Verifikasi Tiket',
      cards: [
        { color: '#38bdf8', icon: 'fa-fingerprint', title: 'Protokol Barcode & E-Ticket Digital', body: 'Sistem mencatat identitas unik file e-voucher (PDF / gambar QR) dan memverifikasi kesesuaian kategori tiket, nomor kursi, dan tanggal event dengan database canonical Tikum.' },
        { color: '#a855f7', icon: 'fa-id-card', title: 'Penukaran Wristband & Surat Kuasa Fisik', body: 'Untuk konser yang mewajibkan penukaran gelang fisik RFID (seperti di GBK atau JIExpo), Tikum memfasilitasi kelengkapan template surat kuasa resmi bermeterai dan fotokopi KTP terenkripsi.' },
        { color: '#10b981', icon: 'fa-users-viewfinder', title: 'Verifikasi Lapangan Bersama Event PIC', body: 'Event PIC Tikum bersiaga di titik kumpul sekitar gate venue untuk mendampingi pembeli dalam proses scanning turnstile resmi.' }
      ],
      faqs: [
        { q: 'Bagaimana jika nama di tiket berbeda dengan nama pembeli baru?', a: 'Tikum memastikan jenis tiket mendukung transfer pihak ketiga atau dilengkapi surat kuasa resmi bermeterai sesuai ketentuan promotor.' }
      ]
    },
    en: {
      title: 'Ticket Verification Standards & Protocols | Tikum',
      description: 'Learn Tikum ticket verification standards: digital barcode validation, physical RFID wristband redemption, power of attorney templates, and on-site Event PIC assistance.',
      h1: 'Ticket Verification Standards & Gate Protocols',
      subtitle: 'Multi-layer verification ensuring ticket validity and authorized gate admission.',
      breadcrumb: 'Ticket Verification',
      cards: [
        { color: '#38bdf8', icon: 'fa-fingerprint', title: 'Digital Barcode & E-Ticket Protocol', body: 'The platform registers unique identifier hashes of e-voucher files (PDF / QR code) and validates ticket category, seat number, and event dates against canonical event records.' },
        { color: '#a855f7', icon: 'fa-id-card', title: 'Physical Wristband Redemption & Power of Attorney', body: 'For events requiring physical RFID wristband exchanges (e.g. GBK or JIExpo), Tikum provides standardized stamped power-of-attorney documents and encrypted ID documentation.' },
        { color: '#10b981', icon: 'fa-users-viewfinder', title: 'On-Site Ground Verification with Event PIC', body: 'Tikum Event PICs stand by at designated meeting points near venue gates to assist buyers during official turnstile admission.' }
      ],
      faqs: [
        { q: 'What if the original ticket name differs from the new buyer?', a: 'Tikum verifies whether ticket terms allow third-party entry or provides compliant authorization letters conforming to organizer rules.' }
      ]
    },
    ms: {
      title: 'Piawaian & Protokol Pengesahan Tiket | Tikum',
      description: 'Ketahui piawaian pengesahan tiket Tikum: pengesahan kod bar digital, penebusan gelang tangan RFID fizikal, surat kuasa rasmi dan bantuan Event PIC di lokasi.',
      h1: 'Piawaian & Protokol Pengesahan Tiket',
      subtitle: 'Pemeriksaan berbilang lapisan bagi memastikan kesahihan tiket dan kemasukan pintu acara yang teratur.',
      breadcrumb: 'Pengesahan Tiket',
      cards: [
        { color: '#38bdf8', icon: 'fa-fingerprint', title: 'Protokol Kod Bar & E-Tiket Digital', body: 'Sistem merekodkan cincangan identiti unik fail e-baucar (PDF / QR) dan mengesahkan kategori tiket, nombor tempat duduk serta tarikh acara.' },
        { color: '#a855f7', icon: 'fa-id-card', title: 'Penukaran Gelang Tangan & Surat Kuasa Fizikal', body: 'Bagi acara yang memerlukan pertukaran gelang RFID fizikal, Tikum menyediakan templat surat kuasa rasmi dan dokumen identiti disulitkan.' },
        { color: '#10b981', icon: 'fa-users-viewfinder', title: 'Pengesahan Lapangan Bersama Event PIC', body: 'Event PIC Tikum bersedia di titik pertemuan berhampiran pintu lokasi bagi membantu pembeli semasa imbasan pintu masuk rasmi.' }
      ],
      faqs: [
        { q: 'Bagaimana jika nama pada tiket berbeza dengan nama pembeli baharu?', a: 'Tikum mengesahkan sama ada terma tiket membenarkan kemasukan pihak ketiga atau menyediakan surat kuasa patuh peraturan penganjur.' }
      ]
    },
    tl: {
      title: 'Mga Pamantayan sa Beripikasyon ng Tiket | Tikum',
      description: 'Alamin ang pamantayan ng Tikum sa beripikasyon ng tiket: digital barcode validation, pisikal na RFID wristband pickup, authorization letter, at tulong ng Event PIC.',
      h1: 'Mga Pamantayan at Protokol sa Beripikasyon ng Tiket',
      subtitle: 'Maraming antas ng pagsusuri upang matiyak ang bisa ng tiket sa gate ng venue.',
      breadcrumb: 'Beripikasyon ng Tiket',
      cards: [
        { color: '#38bdf8', icon: 'fa-fingerprint', title: 'Digital Barcode at E-Ticket Protocol', body: 'Itinatala ng sistema ang natatanging hash ng mga e-voucher file at bini-beripika ang kategorya, upuan, at petsa ng kaganapan.' },
        { color: '#a855f7', icon: 'fa-id-card', title: 'Pagkuha ng Wristband at Power of Attorney', body: 'Para sa mga kaganapang nangangailangan ng pisikal na RFID wristband, nagbibigay ang Tikum ng pamantayang authorization letter at naka-encrypt na dokumentasyon.' },
        { color: '#10b981', icon: 'fa-users-viewfinder', title: 'Beripikasyon sa Venue kasama ang Event PIC', body: 'Nakaantabay ang mga Event PIC ng Tikum sa mga meeting point malapit sa gate upang tulungan ang mga mamimili sa pag-scan sa turnstile.' }
      ],
      faqs: [
        { q: 'Paano kung iba ang pangalan sa tiket kumpara sa bagong mamimili?', a: 'Bini-beripika ng Tikum kung pinapayagan ng tiket ang third-party entry o nagbibigay ng wastong authorization letter alinsunod sa patakaran ng organizer.' }
      ]
    },
    th: {
      title: 'มาตรฐานและขั้นตอนการตรวจสอบบัตร | Tikum',
      description: 'ศึกษามาตรฐานการตรวจสอบบัตรของ Tikum: การตรวจบาร์โค้ดดิจิทัล การแลกสายรัดข้อมือ RFID จริง หนังสือมอบอำนาจ และบริการ Event PIC หน้างาน',
      h1: 'มาตรฐานและขั้นตอนการตรวจสอบบัตร',
      subtitle: 'การตรวจสอบหลายขั้นตอนเพื่อความถูกต้องของบัตรและการผ่านประตูสถานที่จัดงานอย่างราบรื่น',
      breadcrumb: 'การตรวจสอบบัตร',
      cards: [
        { color: '#38bdf8', icon: 'fa-fingerprint', title: 'โปรโตคอลตรวจสอบบาร์โค้ดและ E-Ticket ดิจิทัล', body: 'ระบบบันทึกรหัสแฮชเฉพาะของไฟล์ e-voucher (PDF / QR) และตรวจสอบประเภทบัตร เลขที่นั่ง รวมถึงวันจัดงานให้ตรงกับฐานข้อมูลทางการ' },
        { color: '#a855f7', icon: 'fa-id-card', title: 'การแลกสายรัดข้อมือและหนังสือมอบอำนาจ', body: 'สำหรับงานที่ต้องแลกสายรัดข้อมือ RFID จริง Tikum จัดเตรียมแบบฟอร์มหนังสือมอบอำนาจมาตรฐานและระบบจัดเก็บสำเนาเอกสารที่เข้ารหัสปลอดภัย' },
        { color: '#10b981', icon: 'fa-users-viewfinder', title: 'การตรวจสอบหน้างานร่วมกับเจ้าหน้าที่ Event PIC', body: 'เจ้าหน้าที่ Event PIC ของ Tikum ประจำจุดนัดพบใกล้ประตูทางเข้าเพื่อช่วยเหลือผู้ซื้อระหว่างขั้นตอนการสแกนบัตรเข้างาน' }
      ],
      faqs: [
        { q: 'หากชื่อบนบัตรไม่ตรงกับชื่อผู้ซื้อรายใหม่ต้องทำอย่างไร?', a: 'Tikum ตรวจสอบเงื่อนไขของผู้จัดงานว่าอนุญาตให้โอนสิทธิ์หรือไม่ หรือจัดเตรียมหนังสือมอบอำนาจตามระเบียบของผู้จัดงาน' }
      ]
    }
  },
  escrow: {
    id: {
      title: 'Sistem Penahanan Transaksi Platform Tikum — Tata Kelola Dana Aman | Tikum',
      description: 'Pelajari tata kelola penahanan transaksi platform Tikum: perlindungan dana transaksi dan verifikasi tiket.',
      h1: 'Infrastruktur Escrow: Penahanan Dana Aman',
      subtitle: 'Infrastruktur Escrow: Penahanan Dana Aman — Model tata kelola transaksi terlindungi untuk menjamin keamanan serah terima tiket.',
      breadcrumb: 'Penahanan Dana',
      cards: [
        { color: '#38bdf8', icon: 'fa-vault', title: 'Tata Kelola Transaksi Platform (Platform-Held)', body: 'Tikum menerapkan mekanisme perlindungan transaksi platform-held. Ketika pembeli menyelesaikan pembayaran, dana hasil penjualan ditahan secara administratif oleh platform dan tidak langsung diteruskan ke rekening penjual hingga verifikasi tiket terpenuhi. Tikum bukan merupakan lembaga perbankan atau penyedia jasa escrow berizin tersendiri.' },
        { color: '#10b981', icon: 'fa-lock', title: 'Pencegahan Penipuan Terstruktur', body: 'Mekanisme ini menghilangkan celah penipuan tiket sekunder: dana tidak dapat ditarik oleh penjual tiket fiktif karena transaksi diproteksi oleh tahapan verifikasi bukti dan prosedur resolusi sengketa.' }
      ],
      faqs: [
        { q: 'Apakah Tikum merupakan lembaga perbankan atau escrow berizin?', a: 'Bukan. Tikum adalah platform marketplace teknologi. Mekanisme perlindungan transaksi beroperasi di bawah tata kelola administratif platform (platform-held).' },
        { q: 'Apakah penjual bisa meminta transfer langsung di luar platform?', a: 'Tidak. Seluruh transaksi wajib dilakukan melalui alur resmi platform agar hak perlindungan sengketa tetap berlaku.' }
      ]
    },
    en: {
      title: 'Tikum Platform-Held Governance — Transparent Fund Holding | Tikum',
      description: 'Understand Tikum platform-held safeguards: transactions remain protected until ticket admission terms are verified.',
      h1: 'Platform-Held Custody: Secure Governance',
      subtitle: 'A platform-held protection model ensuring your transactions stay protected through ticket delivery.',
      breadcrumb: 'Platform Holding',
      cards: [
        { color: '#38bdf8', icon: 'fa-vault', title: 'Platform-Held Transaction Governance', body: 'Tikum enforces a platform-held transaction structure. When a buyer pays, disbursement to the seller is held administratively until ticket verification conditions are met. Tikum is not a banking institution or independent licensed escrow agent.' },
        { color: '#10b981', icon: 'fa-lock', title: 'Fraud Deterrence by Design', body: 'This mechanism removes malicious resale incentives: sellers cannot receive payouts on invalid or duplicate tickets, protecting buyers through structured dispute evidence protocols.' }
      ],
      faqs: [
        { q: 'Is Tikum a licensed banking or escrow company?', a: 'No. Tikum is a technology marketplace platform. Protection mechanisms operate under administrative platform-held transaction governance.' },
        { q: 'Can sellers demand direct off-platform transfers?', a: 'No. All purchases must proceed through authorized platform checkouts to maintain dispute protection.' }
      ]
    },
    ms: {
      title: 'Tadbir Urus Pegangan Platform Tikum — Kawalan Dana Telus | Tikum',
      description: 'Fahami perlindungan pegangan platform Tikum: transaksi kekal dilindungi sehingga syarat kemasukan tiket disahkan.',
      h1: 'Tadbir Urus Pegangan Platform: Perlindungan Transaksi',
      subtitle: 'Model perlindungan pegangan platform untuk memastikan transaksi anda kekal selamat sepanjang proses serahan tiket.',
      breadcrumb: 'Pegangan Dana',
      cards: [
        { color: '#38bdf8', icon: 'fa-vault', title: 'Tadbir Urus Transaksi Pegangan Platform', body: 'Tikum melaksanakan struktur transaksi pegangan platform. Apabila pembeli membayar, pelepasan dana kepada penjual ditahan secara pentadbiran sehingga syarat pengesahan tiket dipenuhi. Tikum bukan institusi perbankan.' },
        { color: '#10b981', icon: 'fa-lock', title: 'Pencegahan Penipuan Berstruktur', body: 'Mekanisme ini menghapuskan insentif jualan tiket palsu kerana penjual tidak boleh menerima bayaran bagi tiket yang tidak sah atau pendua.' }
      ],
      faqs: [
        { q: 'Adakah Tikum syarikat perbankan atau escrow berlesen?', a: 'Tidak. Tikum ialah platform pasaran teknologi dengan mekanisme perlindungan transaksi di bawah kawalan pentadbiran dalaman platform.' },
        { q: 'Bolehkah penjual meminta pindahan terus di luar platform?', a: 'Tidak. Semua pembelian mesti melalui aliran rasmi platform agar hak perlindungan pertikaian kekal sah.' }
      ]
    },
    tl: {
      title: 'Pamamahala ng Platform-Held Holding ng Tikum | Tikum',
      description: 'Unawain ang proteksyon ng Tikum: nananatiling protektado ang transaksyon hanggang sa beripikasyon ng pagpasok ng tiket.',
      h1: 'Platform-Held Custody: Ligtas na Pamamahala',
      subtitle: 'Modelong proteksyon na nakatago sa platform upang mapanatiling ligtas ang transaksyon hanggang maihatid ang tiket.',
      breadcrumb: 'Platform Holding',
      cards: [
        { color: '#38bdf8', icon: 'fa-vault', title: 'Pamamahala ng Transaksyon na Hawak ng Platform', body: 'Ipinatutupad ng Tikum ang platform-held transaction structure. Kapag nagbayad ang mamimili, ang payout sa nagbebenta ay administratibong pinipigil hanggang matupad ang beripikasyon. Ang Tikum ay hindi isang bangko.' },
        { color: '#10b981', icon: 'fa-lock', title: 'Pagpigil sa Panloloko sa Disenyo', body: 'Inaalis ng mekanismong ito ang insentibo sa mga pekeng tiket dahil hindi makakatanggap ng bayad ang nagbebenta para sa hindi wastong tiket.' }
      ],
      faqs: [
        { q: 'Ang Tikum ba ay isang lisensyadong bangko?', a: 'Hindi. Ang Tikum ay isang technology marketplace platform na may administratibong platform-held protection controls.' },
        { q: 'Maaari bang humiling ang nagbebenta ng direktang bayad sa labas ng platform?', a: 'Hindi. Lahat ng pagbili ay dapat dumaan sa opisyal na checkout upang mapanatili ang proteksyon sa alitan.' }
      ]
    },
    th: {
      title: 'การกำกับดูแลระบบพักเงินของแพลตฟอร์ม Tikum | Tikum',
      description: 'ทำความเข้าใจระบบพักเงินคุ้มครองธุรกรรมของ Tikum: เงินชำระจะได้รับการปกป้องจนกว่าการตรวจสอบบัตรจะเสร็จสมบูรณ์',
      h1: 'ระบบพักเงินภายใต้การดูแลของแพลตฟอร์ม',
      subtitle: 'รูปแบบการกำกับดูแลธุรกรรมที่ช่วยคุ้มครองเงินชำระตลอดขั้นตอนการส่งมอบและตรวจสอบบัตร',
      breadcrumb: 'ระบบพักเงินแพลตฟอร์ม',
      cards: [
        { color: '#38bdf8', icon: 'fa-vault', title: 'การกำกับดูแลธุรกรรมแบบ Platform-Held', body: 'Tikum ใช้โครงสร้างการพักเงินภายใต้การดูแลของแพลตฟอร์ม เมื่อผู้ซื้อชำระเงิน เงินส่วนของผู้ขายจะถูกพักไว้ในระบบบัญชีภายในจนกว่าเงื่อนไขการตรวจสอบบัตรจะครบถ้วน ทั้งนี้ Tikum ไม่ใช่สถาบันธนาคาร' },
        { color: '#10b981', icon: 'fa-lock', title: 'การป้องกันการทุจริตเชิงระบบ', body: 'กลไกนี้ช่วยตัดช่องว่างของการขายบัตรปลอม เนื่องจากผู้ขายไม่สามารถรับเงินจากบัตรที่ซ้ำหรือไม่ถูกต้องได้' }
      ],
      faqs: [
        { q: 'Tikum เป็นธนาคารหรือผู้ให้บริการเอสโครว์ที่มีใบอนุญาตธนาคารหรือไม่?', a: 'ไม่ใช่ Tikum เป็นแพลตฟอร์มตลาดซื้อขายออนไลน์ที่ใช้ระบบบัญชีควบคุมการพักเงินภายในแพลตฟอร์ม' },
        { q: 'ผู้ขายสามารถขอให้โอนเงินนอกแพลตฟอร์มโดยตรงได้หรือไม่?', a: 'ไม่ได้ ธุรกรรมทั้งหมดต้องดำเนินการผ่านหน้าชำระเงินทางการของแพลตฟอร์มเพื่อรักษาสิทธิ์การคุ้มครองข้อพิพาท' }
      ]
    }
  },
  disputes: {
    id: {
      title: 'Pusat Resolusi Sengketa (Dispute Resolution) & Bukti Tiket | Tikum',
      description: 'Prosedur pengajuan dispute dan investigasi tiket bermasalah di Tikum: bukti verifikasi turnstile, penahanan dana platform-held, dan garansi pengembalian dana.',
      h1: 'Prosedur Resolusi Sengketa (Dispute)',
      subtitle: 'Mekanisme netral berbasis bukti untuk menyelesaikan kendala tiket dan mengembalikan dana pembeli.',
      breadcrumb: 'Resolusi Sengketa',
      cards: [
        { color: '#ef4444', border: '#ef4444', icon: 'fa-triangle-exclamation', title: 'Kapan Dispute Dapat Diajukan?', body: 'Dispute dapat dibuka jika:<br>&bull; Barcode tiket ditolak turnstile dengan notifikasi "already used" / duplikat.<br>&bull; Kategori tiket tidak sesuai dengan apa yang dibeli.<br>&bull; Penjual tidak menyerahkan dokumen tiket sesuai batas waktu kesepakatan.' },
        { color: '#38bdf8', icon: 'fa-camera', title: 'Bukti yang Diperlukan (Evidence Bundle)', body: 'Pembeli wajib melampirkan foto/video layar scanner turnstile, slip penolakan gatekeeper, atau laporan berita acara bersama Event PIC Tikum di lokasi.' },
        { color: '#10b981', icon: 'fa-scale-balanced', title: 'Keputusan Resolusi & Refund', body: 'Tim Trust Officer Tikum memvalidasi bukti dalam 1x24 jam. Jika dispute disetujui, dana yang ditahan dikembalikan penuh ke pembeli dan akun penjual dikenakan sanksi penangguhan permanen.' }
      ],
      faqs: [
        { q: 'Berapa lama proses penyelesaian dispute berlangsung?', a: 'Penyelidikan dispute turnstile di lokasi selesai dalam 1x24 jam setelah bukti lengkap diterima.' }
      ]
    },
    en: {
      title: 'Dispute Resolution Center & Gate Evidence Standards | Tikum',
      description: 'Official dispute procedures and ticket investigation at Tikum: turnstile validation evidence, platform-held protection, and full refund protocol.',
      h1: 'Dispute Resolution Procedures',
      subtitle: 'An evidence-based neutral mechanism to resolve ticket access issues and refund buyer funds.',
      breadcrumb: 'Dispute Resolution',
      cards: [
        { color: '#ef4444', border: '#ef4444', icon: 'fa-triangle-exclamation', title: 'When Can a Dispute Be Opened?', body: 'A dispute can be initiated if:<br>&bull; The ticket barcode is rejected at the turnstile as "already scanned" or duplicate.<br>&bull; The ticket category differs from the purchased listing.<br>&bull; The seller fails to deliver required ticket credentials before the agreed deadline.' },
        { color: '#38bdf8', icon: 'fa-camera', title: 'Required Evidence Bundle', body: 'Buyers provide scanner error photos or videos, turnstile operator rejection slips, or an incident record with the on-site Tikum Event PIC.' },
        { color: '#10b981', icon: 'fa-scale-balanced', title: 'Resolution Decision & Refund', body: 'Tikum Trust Officers evaluate evidence within 24 hours. Upon dispute approval, held funds are refunded in full to the buyer, and fraudulent seller accounts face permanent suspension.' }
      ],
      faqs: [
        { q: 'How long does dispute investigation take?', a: 'Turnstile gate disputes are typically resolved within 24 hours of receiving complete evidence.' }
      ]
    },
    ms: {
      title: 'Pusat Penyelesaian Pertikaian & Piawaian Bukti | Tikum',
      description: 'Prosedur pertikaian rasmi dan siasatan tiket di Tikum: bukti pengimbas pintu masuk, pegangan platform dan bayaran balik penuh.',
      h1: 'Prosedur Penyelesaian Pertikaian',
      subtitle: 'Mekanisme neutral berasaskan bukti untuk menyelesaikan isu kemasukan tiket dan memulangkan dana pembeli.',
      breadcrumb: 'Penyelesaian Pertikaian',
      cards: [
        { color: '#ef4444', border: '#ef4444', icon: 'fa-triangle-exclamation', title: 'Bilakah Pertikaian Boleh Dibuka?', body: 'Pertikaian boleh dimulakan jika:<br>&bull; Kod bar tiket ditolak di pintu masuk sebagai pendua.<br>&bull; Kategori tiket berbeza daripada penyenaraian yang dibeli.<br>&bull; Penjual gagal menghantar dokumen tiket sebelum tarikh akhir.' },
        { color: '#38bdf8', icon: 'fa-camera', title: 'Himpunan Bukti Diperlukan', body: 'Pembeli melampirkan foto atau video ralat pengimbas, slip penolakan pintu masuk, atau laporan insiden bersama Event PIC Tikum.' },
        { color: '#10b981', icon: 'fa-scale-balanced', title: 'Keputusan & Bayaran Balik', body: 'Pegawai Amanah Tikum menilai bukti dalam 24 jam. Jika diluluskan, dana dipulangkan sepenuhnya kepada pembeli dan akaun penjual bermasalah digantung kekal.' }
      ],
      faqs: [
        { q: 'Berapa lamakah siasatan pertikaian mengambil masa?', a: 'Pertikaian pintu masuk biasanya diselesaikan dalam tempoh 24 jam selepas bukti lengkap diterima.' }
      ]
    },
    tl: {
      title: 'Sentro ng Pagresolba ng Alitan at Pamantayan ng Ebidensya | Tikum',
      description: 'Mga opisyal na pamamaraan ng alitan at imbestigasyon sa tiket sa Tikum.',
      h1: 'Mga Pamamaraan sa Pagresolba ng Alitan',
      subtitle: 'Isang neutral na mekanismong nakabatay sa ebidensya upang lutasin ang mga isyu sa tiket at ibalik ang pondo ng mamimili.',
      breadcrumb: 'Pagresolba ng Alitan',
      cards: [
        { color: '#ef4444', border: '#ef4444', icon: 'fa-triangle-exclamation', title: 'Kailan Maaaring Magbukas ng Alitan?', body: 'Maaaring magbukas ng alitan kung:<br>&bull; Tinanggihan ang barcode sa turnstile bilang nagamit na o doble.<br>&bull; Iba ang kategorya ng tiket kumpara sa biniling listing.<br>&bull; Nabigo ang nagbebenta na ihatid ang tiket sa takdang oras.' },
        { color: '#38bdf8', icon: 'fa-camera', title: 'Kinakailangang Bundle ng Ebidensya', body: 'Magbibigay ang mamimili ng larawan o video ng error sa scanner, rejection slip, o ulat ng insidente kasama ang Event PIC.' },
        { color: '#10b981', icon: 'fa-scale-balanced', title: 'Desisyon at Pagbabalik ng Bayad', body: 'Sinusuri ng Trust Officer ang ebidensya sa loob ng 24 oras. Kapag naaprubahan, ibinabalik nang buo ang bayad sa mamimili.' }
      ],
      faqs: [
        { q: 'Gaano katagal ang imbestigasyon ng alitan?', a: 'Karaniwang nareresolba ang mga alitan sa turnstile gate sa loob ng 24 oras matapos matanggap ang kumpletong ebidensya.' }
      ]
    },
    th: {
      title: 'ศูนย์ระงับข้อพิพาทและมาตรฐานหลักฐาน | Tikum',
      description: 'ขั้นตอนการยื่นข้อพิพาทและการตรวจสอบปัญหาบัตรบน Tikum พร้อมระบบคุ้มครองการคืนเงิน',
      h1: 'ขั้นตอนการระงับข้อพิพาท (Dispute Resolution)',
      subtitle: 'กลไกที่เป็นกลางโดยอ้างอิงจากหลักฐานจริงเพื่อแก้ไขปัญหาการเข้างานและคืนเงินให้ผู้ซื้อ',
      breadcrumb: 'การระงับข้อพิพาท',
      cards: [
        { color: '#ef4444', border: '#ef4444', icon: 'fa-triangle-exclamation', title: 'สามารถเปิดข้อพิพาทได้เมื่อใด?', body: 'สามารถเปิดข้อพิพาทได้เมื่อ:<br>&bull; บาร์โค้ดบัตรถูกเครื่องสแกนที่ประตูปฏิเสธว่าถูกใช้งานแล้วหรือซ้ำ<br>&bull; ประเภทบัตรไม่ตรงกับรายการที่สั่งซื้อ<br>&bull; ผู้ขายไม่ส่งมอบเอกสารบัตรภายในเวลาที่ตกลงกัน' },
        { color: '#38bdf8', icon: 'fa-camera', title: 'ชุดหลักฐานที่ต้องใช้ (Evidence Bundle)', body: 'ผู้ซื้อแนบภาพถ่ายหรือวิดีโอหน้าจอเครื่องสแกน ใบยืนยันการปฏิเสธจากเจ้าหน้าที่ประตู หรือบันทึกเหตุการณ์ร่วมกับ Event PIC หน้างาน' },
        { color: '#10b981', icon: 'fa-scale-balanced', title: 'ผลการพิจารณาและการคืนเงิน', body: 'เจ้าหน้าที่ Trust Officer จะตรวจสอบหลักฐานภายใน 24 ชั่วโมง หากอนุมัติ เงินจะถูกคืนให้ผู้ซื้อเต็มจำนวนและระงับบัญชีผู้ขายที่กระทำผิดถาวร' }
      ],
      faqs: [
        { q: 'การตรวจสอบข้อพิพาทใช้เวลานานเท่าใด?', a: 'ข้อพิพาทหน้าประตูทางเข้างานจะได้รับการตรวจสอบและตัดสินภายใน 24 ชั่วโมงหลังจากได้รับหลักฐานครบถ้วน' }
      ]
    }
  },
  about: {
    id: {
      title: 'Tentang TIKUM — Marketplace Tiket Sekunder | PT SHINERVA PRAJNA TEJAS',
      description: 'Pelajari tentang TIKUM, marketplace tiket sekunder terverifikasi yang dioperasikan oleh PT SHINERVA PRAJNA TEJAS di Indonesia.',
      h1: 'Tentang TIKUM & PT SHINERVA PRAJNA TEJAS',
      subtitle: 'Membangun ekosistem tiket sekunder terverifikasi di Indonesia dengan transparansi, perlindungan transaksi, dan pendampingan di venue.',
      breadcrumb: 'Tentang Kami',
      entityBadge: 'Identitas Badan Usaha Resmi',
      operatedBy: 'TIKUM — Dioperasikan oleh PT SHINERVA PRAJNA TEJAS',
      heading: 'Tentang TIKUM & PT SHINERVA PRAJNA TEJAS',
      body: '<strong>TIKUM</strong> (tikum.app) adalah marketplace tiket sekunder terverifikasi di Indonesia yang dioperasikan di bawah naungan <strong>PT SHINERVA PRAJNA TEJAS</strong>. TIKUM hadir untuk mengatasi maraknya penipuan tiket konser dan festival di media sosial dengan menyediakan ekosistem jual-beli tiket yang aman, transparan, dan terlindungi.',
      addressLabel: 'Badan Hukum & Alamat Terdaftar:',
      contactLabel: 'Kontak Resmi & Jam Layanan:',
      hours: 'Jam Layanan: Senin – Minggu: 09:00 – 21:00 WIB',
      disclaimerTitle: 'Batasan Otoritas & Independensi Platform',
      disclaimerBody: 'TIKUM merupakan platform marketplace tiket sekunder pihak ketiga yang independen. Kecuali dinyatakan secara tertulis melalui kemitraan resmi, TIKUM <strong>bukan</strong> merupakan agen penjual tiket resmi primer (primary ticketing agent), promotor, atau penyelenggara acara. Kami memfasilitasi transaksi aman antar penggemar yang berhalangan hadir agar tiket dapat dimanfaatkan secara sah.',
      pillars: [
        { color: '#38bdf8', icon: 'fa-shield-check', title: 'Verifikasi Bukti Tiket', body: 'Setiap pendaftaran tiket wajib menyertakan bukti pembelian e-voucher sah dan barcode unik. Pendaftaran duplikat dicegah otomatis oleh sistem.' },
        { color: '#10b981', icon: 'fa-lock', title: 'Penahanan Dana Bersyarat', body: 'Dana pembayaran pembeli diamankan di rekening penampungan dan baru dicairkan ke penjual setelah tiket berhasil dipakai tanpa sengketa.' },
        { color: '#818cf8', icon: 'fa-people-arrows', title: 'Tim Event PIC di Venue', body: 'Untuk event besar terkonfirmasi, staf operasional Event PIC hadir di gerbang venue untuk membantu verifikasi fisik dan berita acara turnstile.' }
      ],
      faqs: [
        { q: 'Apa hubungan antara TIKUM dan PT SHINERVA PRAJNA TEJAS?', a: 'TIKUM adalah merek dagang dan platform marketplace konsumen yang dimiliki dan dioperasikan resmi oleh PT SHINERVA PRAJNA TEJAS.' },
        { q: 'Apakah TIKUM merupakan promotor atau ticketing resmi acara?', a: 'TIKUM beroperasi sebagai marketplace sekunder independen untuk memfasilitasi transaksi jual-beli antar penggemar secara aman, dan bukan merupakan promotor atau agen primer acara kecuali dicantumkan secara khusus.' }
      ]
    },
    en: {
      title: 'About TIKUM — Secondary Ticket Marketplace | PT SHINERVA PRAJNA TEJAS',
      description: 'Learn about TIKUM, the verified secondary ticket marketplace operated by PT SHINERVA PRAJNA TEJAS in Indonesia.',
      h1: 'About TIKUM & PT SHINERVA PRAJNA TEJAS',
      subtitle: 'Pioneering transparent secondary ticketing infrastructure with verified authenticity and on-site support.',
      breadcrumb: 'About Us',
      entityBadge: 'Official Business Identity',
      operatedBy: 'TIKUM — Operated by PT SHINERVA PRAJNA TEJAS',
      heading: 'About TIKUM & PT SHINERVA PRAJNA TEJAS',
      body: '<strong>TIKUM</strong> (tikum.app) is a verified secondary ticket marketplace designed and operated by <strong>PT SHINERVA PRAJNA TEJAS</strong>. We provide fan-to-fan ticket resale infrastructure across Indonesia with ticket verification, platform-held transaction protection, and dedicated on-site venue assistance.',
      addressLabel: 'Registered Legal Entity:',
      contactLabel: 'Official Contact & Support:',
      hours: 'Operating Hours: Monday – Sunday: 09:00 – 21:00 WIB',
      disclaimerTitle: 'Platform Role & Independence Disclaimer',
      disclaimerBody: 'TIKUM is an independent secondary ticket marketplace. Unless explicitly verified and documented otherwise, TIKUM is <strong>not</strong> the primary ticketing issuer, event organizer, or promoter. We provide a safe, mediated marketplace for ticket holders who can no longer attend an event to resell their genuine tickets to other fans.',
      pillars: [
        { color: '#38bdf8', icon: 'fa-shield-check', title: 'Ticket Verification', body: 'Every listing requires genuine proof of purchase and a unique barcode identifier. Duplicate ticket postings are systematically rejected.' },
        { color: '#10b981', icon: 'fa-lock', title: 'Platform-Held Protection', body: 'Buyer payments are securely held by the platform and only disbursed to the seller after the event entry is completed without dispute.' },
        { color: '#818cf8', icon: 'fa-people-arrows', title: 'Event PIC On-Site', body: 'For select major events, dedicated Event PIC staff are on-site at venue gates to facilitate wristband redemptions and dispute evidence logging.' }
      ],
      faqs: [
        { q: 'What is the relationship between TIKUM and PT SHINERVA PRAJNA TEJAS?', a: 'TIKUM is the official consumer-facing marketplace brand operated by PT SHINERVA PRAJNA TEJAS.' },
        { q: 'Is TIKUM an official ticketing partner of the events?', a: 'TIKUM operates as an independent secondary marketplace facilitating fan-to-fan resales. We are not the primary promoter unless explicitly designated.' }
      ]
    },
    ms: {
      title: 'Tentang TIKUM — Pasaran Tiket Sekunder | PT SHINERVA PRAJNA TEJAS',
      description: 'Ketahui tentang TIKUM, pasaran tiket sekunder terbukti yang dikendalikan oleh PT SHINERVA PRAJNA TEJAS di Indonesia.',
      h1: 'Tentang TIKUM & PT SHINERVA PRAJNA TEJAS',
      subtitle: 'Membina infrastruktur tiket sekunder yang telus dengan pengesahan keaslian dan sokongan di lokasi.',
      breadcrumb: 'Tentang Kami',
      entityBadge: 'Identiti Entiti Perniagaan Rasmi',
      operatedBy: 'TIKUM — Dikendalikan oleh PT SHINERVA PRAJNA TEJAS',
      heading: 'Tentang TIKUM & PT SHINERVA PRAJNA TEJAS',
      body: '<strong>TIKUM</strong> (tikum.app) ialah pasaran tiket sekunder terbukti yang dikendalikan oleh <strong>PT SHINERVA PRAJNA TEJAS</strong> bagi menyediakan transaksi jual-beli tiket antara peminat yang selamat, telus dan terlindung di Indonesia.',
      addressLabel: 'Entiti Undang-undang & Alamat Berdaftar:',
      contactLabel: 'Hubungan Rasmi & Sokongan:',
      hours: 'Waktu Operasi: Isnin – Ahad: 09:00 – 21:00 WIB',
      disclaimerTitle: 'Peranan Platform & Penafian Kebebasan',
      disclaimerBody: 'TIKUM ialah pasaran tiket sekunder pihak ketiga yang bebas dan <strong>bukan</strong> penerbit tiket utama atau penganjur acara melainkan dinyatakan sebaliknya melalui perkongsian rasmi.',
      pillars: [
        { color: '#38bdf8', icon: 'fa-shield-check', title: 'Pengesahan Tiket', body: 'Setiap penyenaraian memerlukan bukti pembelian asal dan pengecam kod bar unik bagi menghalang penduaan.' },
        { color: '#10b981', icon: 'fa-lock', title: 'Perlindungan Pegangan Platform', body: 'Pembayaran pembeli dipegang secara selamat oleh platform dan hanya dilepaskan selepas kemasukan acara selesai tanpa pertikaian.' },
        { color: '#818cf8', icon: 'fa-people-arrows', title: 'Event PIC di Lokasi', body: 'Untuk acara terpilih, petugas Event PIC hadir di pintu lokasi bagi membantu penebusan gelang dan catatan bukti.' }
      ],
      faqs: [
        { q: 'Apakah hubungan antara TIKUM dan PT SHINERVA PRAJNA TEJAS?', a: 'TIKUM ialah jenama pasaran pengguna rasmi yang dimiliki dan dikendalikan oleh PT SHINERVA PRAJNA TEJAS.' },
        { q: 'Adakah TIKUM rakan tiket rasmi acara?', a: 'TIKUM beroperasi sebagai pasaran sekunder bebas antara peminat, bukan penganjur utama melainkan ditetapkan secara khusus.' }
      ]
    },
    tl: {
      title: 'Tungkol sa TIKUM — Secondary Ticket Marketplace | PT SHINERVA PRAJNA TEJAS',
      description: 'Alamin ang tungkol sa TIKUM na pinamamahalaan ng PT SHINERVA PRAJNA TEJAS sa Indonesia.',
      h1: 'Tungkol sa TIKUM at PT SHINERVA PRAJNA TEJAS',
      subtitle: 'Nagtatayo ng malinaw na imprastraktura ng pangalawang tiket na may beripikasyon at suporta sa venue.',
      breadcrumb: 'Tungkol sa Amin',
      entityBadge: 'Opisyal na Pagkakakilanlan ng Negosyo',
      operatedBy: 'TIKUM — Pinamamahalaan ng PT SHINERVA PRAJNA TEJAS',
      heading: 'Tungkol sa TIKUM at PT SHINERVA PRAJNA TEJAS',
      body: 'Ang <strong>TIKUM</strong> (tikum.app) ay isang beripikadong secondary ticket marketplace na pinamamahalaan ng <strong>PT SHINERVA PRAJNA TEJAS</strong> upang magbigay ng ligtas at malinaw na bentahan ng tiket sa pagitan ng mga tagahanga.',
      addressLabel: 'Nakarehistrong Legal na Entidad:',
      contactLabel: 'Opisyal na Suporta at Pakikipag-ugnayan:',
      hours: 'Oras ng Operasyon: Lunes – Linggo: 09:00 – 21:00 WIB',
      disclaimerTitle: 'Papel ng Platform at Pagtatanggi ng Kalayaan',
      disclaimerBody: 'Ang TIKUM ay isang independiyenteng secondary marketplace at <strong>hindi</strong> pangunahing tagapaglabas ng tiket o promoter ng kaganapan maliban kung hayagang nakasaad.',
      pillars: [
        { color: '#38bdf8', icon: 'fa-shield-check', title: 'Beripikasyon ng Tiket', body: 'Ang bawat listing ay nangangailangan ng tunay na patunay ng pagbili at natatanging barcode upang maiwasan ang duplikasyon.' },
        { color: '#10b981', icon: 'fa-lock', title: 'Proteksyong Hawak ng Platform', body: 'Ang bayad ng mamimili ay ligtas na itinatago ng platform hanggang matapos ang pagpasok nang walang alitan.' },
        { color: '#818cf8', icon: 'fa-people-arrows', title: 'Event PIC sa Venue', body: 'Para sa mga piling malalaking kaganapan, may mga tauhan ng Event PIC sa gate upang tumulong sa pagkuha ng wristband at pagdodokumento.' }
      ],
      faqs: [
        { q: 'Ano ang ugnayan ng TIKUM at PT SHINERVA PRAJNA TEJAS?', a: 'Ang TIKUM ang opisyal na brand ng marketplace na pinamamahalaan ng PT SHINERVA PRAJNA TEJAS.' },
        { q: 'Opisyal na ticketing partner ba ang TIKUM?', a: 'Gumagana ang TIKUM bilang independiyenteng secondary marketplace para sa mga tagahanga at hindi pangunahing promoter.' }
      ]
    },
    th: {
      title: 'เกี่ยวกับ TIKUM — ตลาดซื้อขายบัตรมือสอง | PT SHINERVA PRAJNA TEJAS',
      description: 'ทำความรู้จักกับ TIKUM ตลาดซื้อขายบัตรมือสองที่ผ่านการตรวจสอบ ดำเนินการโดย PT SHINERVA PRAJNA TEJAS ในอินโดนีเซีย',
      h1: 'เกี่ยวกับ TIKUM และ PT SHINERVA PRAJNA TEJAS',
      subtitle: 'สร้างโครงสร้างพื้นฐานตลาดบัตรมือสองที่โปร่งใส ตรวจสอบได้ พร้อมทีมสนับสนุนหน้างาน',
      breadcrumb: 'เกี่ยวกับเรา',
      entityBadge: 'ข้อมูลนิติบุคคลอย่างเป็นทางการ',
      operatedBy: 'TIKUM — ดำเนินการโดย PT SHINERVA PRAJNA TEJAS',
      heading: 'เกี่ยวกับ TIKUM และ PT SHINERVA PRAJNA TEJAS',
      body: '<strong>TIKUM</strong> (tikum.app) คือตลาดซื้อขายบัตรอีเวนต์มือสองที่ผ่านการตรวจสอบ ซึ่งออกแบบและดำเนินการโดย <strong>PT SHINERVA PRAJNA TEJAS</strong> เพื่อแก้ไขปัญหาการโกงบัตรบนโซเชียลมีเดียด้วยระบบธุรกรรมที่ปลอดภัยและโปร่งใส',
      addressLabel: 'นิติบุคคลและที่อยู่จดทะเบียน:',
      contactLabel: 'ช่องทางติดต่อและฝ่ายสนับสนุนอย่างเป็นทางการ:',
      hours: 'เวลาทำการ: วันจันทร์ – วันอาทิตย์: 09:00 – 21:00 WIB',
      disclaimerTitle: 'บทบาทและความเป็นอิสระของแพลตฟอร์ม',
      disclaimerBody: 'TIKUM เป็นตลาดกลางซื้อขายบัตรมือสองอิสระ และ<strong>ไม่ใช่</strong>ผู้จำหน่ายบัตรหลัก (Primary Ticketing) หรือผู้จัดงานอีเวนต์ เว้นแต่จะระบุไว้เป็นลายลักษณ์อักษรอย่างเป็นทางการ',
      pillars: [
        { color: '#38bdf8', icon: 'fa-shield-check', title: 'การตรวจสอบหลักฐานบัตร', body: 'ทุกรายการต้องแนบหลักฐานการซื้อจริงและรหัสบาร์โค้ดเฉพาะ ระบบป้องกันการลงขายซ้ำโดยอัตโนมัติ' },
        { color: '#10b981', icon: 'fa-lock', title: 'การพักเงินอย่างมีเงื่อนไข', body: 'เงินชำระของผู้ซื้อจะถูกดูแลอย่างปลอดภัยและโอนให้ผู้ขายหลังจากการเข้างานเสร็จสมบูรณ์โดยไม่มีข้อพิพาท' },
        { color: '#818cf8', icon: 'fa-people-arrows', title: 'ทีม Event PIC ณ สถานที่จัดงาน', body: 'สำหรับอีเวนต์สำคัญที่ร่วมรายการ เจ้าหน้าที่ Event PIC จะประจำการที่ประตูทางเข้าเพื่อช่วยตรวจสอบและบันทึกหลักฐาน' }
      ],
      faqs: [
        { q: 'TIKUM และ PT SHINERVA PRAJNA TEJAS มีความเกี่ยวข้องกันอย่างไร?', a: 'TIKUM เป็นแบรนด์และแพลตฟอร์มตลาดซื้อขายบัตรสำหรับผู้บริโภคที่อยู่ภายใต้การดำเนินงานอย่างเป็นทางการของ PT SHINERVA PRAJNA TEJAS' },
        { q: 'TIKUM เป็นผู้จัดงานหรือตัวแทนจำหน่ายบัตรหลักหรือไม่?', a: 'ไม่ใช่ TIKUM ดำเนินงานในฐานะตลาดกลางซื้อขายบัตรมือสองอิสระระหว่างแฟนงานอีเวนต์' }
      ]
    }
  },
  fees: {
    id: {
      title: 'Struktur Biaya & Skema Harga Resmi | Tikum',
      description: 'Rincian lengkap biaya platform TIKUM Dual-Tier V2: 6% Transfer Mandiri, 9% PIC Venue, gratis pasang listing, dan batas markup +30%.',
      h1: 'Struktur Harga & Biaya Layanan Resmi',
      subtitle: 'Keterbukaan rincian tarif layanan, tanpa biaya tersembunyi atau pungutan tak terduga.',
      breadcrumb: 'Struktur Biaya',
      heading: 'Rincian Struktur Biaya Platform Dual-Tier V2',
      lead: 'TIKUM menerapkan skema biaya V2 Dual-Tier yang dihitung deterministik per tiket di server dan dikunci melalui quote pesanan sebelum pembeli menyelesaikan checkout.',
      cols: ['Komponen / Tier Layanan', 'Tarif / Ketentuan', 'Keterangan Operasional'],
      rows: [
        ['Biaya Pasang Listing Penjual', 'Rp 0 (Gratis)', 'Penjual dapat mendaftarkan tiket tanpa biaya awal di muka.'],
        ['Opsi B: Transfer Mandiri (SELLER_MANAGED)', '6% Pembeli + 6% Penjual (Min. Rp35.000, Maks. Rp300.000/tiket)', 'Penjual mentransfer e-tiket langsung; pembayaran ditahan secara aman (platform-held) hingga verifikasi selesai.'],
        ['Opsi A: Dibantu PIC Venue (TIKUM_VENUE_PIC)', '9% Pembeli + 9% Penjual (Min. Rp35.000, Maks. Rp450.000/tiket)', 'Termasuk pendampingan petugas lapangan Event PIC di gerbang venue dan penukaran wristband fisik.'],
        ['Batas Markup Maksimum', 'Maksimal +30% dari Face Value', 'Mencegah lonjakan harga calo dan menjaga keadilan harga tiket bagi sesama penggemar.'],
        ['Batas Harga Tiket Minimum', 'Rp 500.000 per tiket', 'Standar nominal minimum untuk memastikan kelayakan kurasi tiket konser dan festival.']
      ],
      flowHeading: 'Transparansi Alur Dana & DOKU Hold & Release',
      flowBodyHtml: 'Pelajari bagaimana dana pembeli dikelola dalam buku besar akuntansi berpasangan internal platform TIKUM, syarat pencairan penjual, dan jalur pengembalian dana: <a href="/payment-flow" style="color:#E36F45; font-weight:700; text-decoration:underline;">Lihat Alur Dana &amp; Penahanan Transaksi (/payment-flow)</a>.',
      faqs: [
        { q: 'Apakah ada biaya administrasi tersembunyi saat checkout?', a: 'Tidak. Seluruh komponen biaya Dual-Tier V2 (6% Transfer Mandiri atau 9% PIC Venue) tertera transparan pada rincian quote pesanan sebelum pembayaran.' },
        { q: 'Apakah biaya platform dikembalikan jika event dibatalkan?', a: 'Ya, apabila acara dibatalkan resmi oleh promotor atau terjadi kegagalan serah terima oleh penjual, dana dikembalikan penuh sesuai Kebijakan Refund.' }
      ]
    },
    en: {
      title: 'Platform Fees & Transparent Pricing Schedule | Tikum',
      description: 'Comprehensive breakdown of TIKUM Dual-Tier V2 platform fees: 6% Seller-Managed, 9% Venue PIC, 0 listing fee, and +30% markup cap.',
      h1: 'Platform Fees & Pricing Transparency',
      subtitle: 'Transparent, itemized pricing without hidden markups or unexpected fees.',
      breadcrumb: 'Platform Fees',
      heading: 'Transparent Dual-Tier Fee Structure V2 (No Hidden Fees)',
      lead: 'TIKUM applies an open, itemized fee schedule calculated deterministically per ticket by our server-authoritative Dual-Tier V2 pricing engine. All components are locked atomically in an immutable quote before checkout.',
      cols: ['Service Component / Tier', 'Rate / Rule', 'Operational Purpose'],
      rows: [
        ['Seller Listing Fee', 'IDR 0 (Free)', 'Sellers list tickets without upfront publication charges.'],
        ['Option B: Seller-Managed (SELLER_MANAGED)', '6% Buyer + 6% Seller (Min. IDR 35,000, Max. IDR 300,000/ticket)', 'Seller transfers e-ticket directly; platform-held payment custody and verification apply until completion.'],
        ['Option A: Venue PIC Assisted (TIKUM_VENUE_PIC)', '9% Buyer + 9% Seller (Min. IDR 35,000, Max. IDR 450,000/ticket)', 'Dedicated on-site Event PIC field coordinator, wristband exchange accompaniment, and gate support.'],
        ['Maximum Markup Cap', 'Max +30% of Face Value', 'Prevents predatory price gouging and ensures fair market rates.'],
        ['Minimum Ticket Price', 'IDR 500,000 / ticket', 'Threshold to maintain curation quality for concert and festival tickets.']
      ],
      flowHeading: 'Detailed Funds Flow & DOKU Hold & Release',
      flowBodyHtml: 'Learn how buyer payments are held under our double-entry ledger controls and DOKU settlement separation: <a href="/payment-flow" style="color:#E36F45; font-weight:700; text-decoration:underline;">View Funds Flow &amp; Ledger Architecture (/payment-flow)</a>.',
      faqs: [
        { q: 'Are there any hidden administrative fees at checkout?', a: 'No. All applicable Dual-Tier V2 fees (6% Seller-Managed or 9% Venue PIC) are atomically locked in an itemized quote before order confirmation.' },
        { q: 'Does TIKUM take fees if the event is cancelled?', a: 'In the event of official cancellation or verified seller default, platform fees are covered under our full refund policy.' }
      ]
    },
    ms: {
      title: 'Struktur Yuran Platform & Harga Telus | Tikum',
      description: 'Pecahan lengkap yuran platform TIKUM Dual-Tier V2: 6% Pindahan Penjual, 9% PIC Lokasi, penyenaraian percuma, dan had tokokan +30%.',
      h1: 'Yuran Platform & Ketelusan Harga',
      subtitle: 'Harga terperinci dan telus tanpa caj tersembunyi.',
      breadcrumb: 'Struktur Yuran',
      heading: 'Struktur Yuran Dual-Tier V2 Telus',
      lead: 'TIKUM melaksanakan jadual yuran V2 Dual-Tier yang dikira secara deterministik di pelayan dan dikunci dalam sebut harga sebelum pembayaran.',
      cols: ['Komponen / Peringkat', 'Kadar / Peraturan', 'Tujuan Operasi'],
      rows: [
        ['Yuran Penyenaraian Penjual', 'IDR 0 (Percuma)', 'Penjual menyenaraikan tiket tanpa caj penerbitan awal.'],
        ['Pilihan B: Pindahan Penjual (SELLER_MANAGED)', '6% Pembeli + 6% Penjual (Min. IDR 35,000, Maks. IDR 300,000/tiket)', 'Penjual memindahkan e-tiket terus; pegangan platform dan pengesahan terpakai sehingga selesai.'],
        ['Pilihan A: Dibantu PIC Lokasi (TIKUM_VENUE_PIC)', '9% Pembeli + 9% Penjual (Min. IDR 35,000, Maks. IDR 450,000/tiket)', 'Penyelaras Event PIC di lokasi, bantuan penukaran gelang dan sokongan pintu masuk.'],
        ['Had Tokokan Maksimum', 'Maks. +30% daripada Harga Muka', 'Mengelakkan harga melampau dan memastikan kadar pasaran adil.'],
        ['Harga Tiket Minimum', 'IDR 500,000 / tiket', 'Ambang minimum untuk memastikan kualiti kurasi tiket acara.']
      ],
      flowHeading: 'Aliran Dana Terperinci & DOKU Hold & Release',
      flowBodyHtml: 'Ketahui cara pembayaran pembeli diurus dalam lejar perakaunan berganda kami: <a href="/payment-flow" style="color:#E36F45; font-weight:700; text-decoration:underline;">Lihat Aliran Dana (/payment-flow)</a>.',
      faqs: [
        { q: 'Adakah terdapat yuran pentadbiran tersembunyi semasa checkout?', a: 'Tidak. Semua yuran Dual-Tier V2 dikunci dalam sebut harga terperinci sebelum pengesahan pesanan.' },
        { q: 'Adakah yuran dipulangkan jika acara dibatalkan?', a: 'Ya, sekiranya acara dibatalkan secara rasmi oleh penganjur, bayaran balik penuh terpakai di bawah Dasar Bayaran Balik kami.' }
      ]
    },
    tl: {
      title: 'Istruktura ng Bayarin sa Platform at Malinaw na Presyo | Tikum',
      description: 'Kumpletong detalye ng mga bayarin sa TIKUM Dual-Tier V2: 6% Seller-Managed, 9% Venue PIC, libreng pag-list, at +30% markup cap.',
      h1: 'Mga Bayarin sa Platform at Kalinawan ng Presyo',
      subtitle: 'Malinaw at detalyadong pagpepresyo nang walang nakatagong singil.',
      breadcrumb: 'Mga Bayarin',
      heading: 'Malinaw na Istruktura ng Bayarin Dual-Tier V2',
      lead: 'Nagpapatupad ang TIKUM ng deterministikong Dual-Tier V2 na nakatali sa quote bago ang pagbabayad.',
      cols: ['Bahagi / Tier', 'Singil / Panuntunan', 'Layuning Operasyonal'],
      rows: [
        ['Bayarin sa Pag-list ng Nagbebenta', 'IDR 0 (Libre)', 'Walang paunang singil sa paglilista ng tiket.'],
        ['Opsyon B: Seller-Managed (SELLER_MANAGED)', '6% Mamimili + 6% Nagbebenta (Min. IDR 35,000, Max. IDR 300,000/tiket)', 'Direktang ililipat ng nagbebenta ang e-ticket; hawak ng platform ang pondo hanggang matapos ang beripikasyon.'],
        ['Opsyon A: May Tulong ng Venue PIC (TIKUM_VENUE_PIC)', '9% Mamimili + 9% Nagbebenta (Min. IDR 35,000, Max. IDR 450,000/tiket)', 'May Event PIC sa venue para sa tulong sa wristband at beripikasyon sa gate.'],
        ['Pinakamataas na Markup Cap', 'Max +30% ng Face Value', 'Pinipigilan ang sobrang pagtaas ng presyo para sa patas na merkado.'],
        ['Pinakamababang Presyo ng Tiket', 'IDR 500,000 / tiket', 'Pamantayan upang mapanatili ang kalidad ng imbentaryo.']
      ],
      flowHeading: 'Detalyadong Daloy ng Pondo at DOKU Hold & Release',
      flowBodyHtml: 'Alamin kung paano pinamamahalaan ang pondo sa aming double-entry ledger: <a href="/payment-flow" style="color:#E36F45; font-weight:700; text-decoration:underline;">Tingnan ang Daloy ng Pondo (/payment-flow)</a>.',
      faqs: [
        { q: 'May mga nakatagong bayarin ba sa checkout?', a: 'Wala. Lahat ng naaangkop na bayarin ay nakalista nang malinaw sa quote bago magbayad.' },
        { q: 'Ibinabalik ba ang bayad kung makansela ang kaganapan?', a: 'Oo, sa opisyal na pagkansela ng organizer, saklaw ito ng aming Patakaran sa Refund.' }
      ]
    },
    th: {
      title: 'อัตราค่าธรรมเนียมแพลตฟอร์มและความโปร่งใสของราคา | Tikum',
      description: 'รายละเอียดอัตราค่าบริการ TIKUM Dual-Tier V2: 6% ผู้ขายโอนเอง, 9% เจ้าหน้าที่ PIC หน้างาน, ลงรายการฟรี และเพดานบวกราคา +30%',
      h1: 'โครงสร้างราคาและค่าธรรมเนียมอย่างเป็นทางการ',
      subtitle: 'แสดงค่าใช้จ่ายครบทุกรายการอย่างโปร่งใส ไม่มีค่าธรรมเนียมแอบแฝง',
      breadcrumb: 'โครงสร้างค่าธรรมเนียม',
      heading: 'รายละเอียดโครงสร้างค่าบริการ Dual-Tier V2',
      lead: 'TIKUM ใช้การคำนวณค่าบริการ Dual-Tier V2 อย่างแม่นยำจากเซิร์ฟเวอร์และล็อกยอดในใบเสนอราคาก่อนผู้ซื้อชำระเงิน',
      cols: ['องค์ประกอบ / ระดับบริการ', 'อัตราค่าบริการ / เงื่อนไข', 'วัตถุประสงค์การดำเนินงาน'],
      rows: [
        ['ค่าลงรายการขาย (ผู้ขาย)', 'IDR 0 (ฟรี)', 'ผู้ขายลงประกาศขายบัตรได้โดยไม่มีค่าธรรมเนียมล่วงหน้า'],
        ['ตัวเลือก B: ผู้ขายโอนเอง (SELLER_MANAGED)', 'ผู้ซื้อ 6% + ผู้ขาย 6% (ขั้นต่ำ IDR 35,000, สูงสุด IDR 300,000/ใบ)', 'ผู้ขายโอน e-ticket โดยตรง พร้อมระบบพักเงินและตรวจสอบของแพลตฟอร์มจนเสร็จสมบูรณ์'],
        ['ตัวเลือก A: มีเจ้าหน้าที่ PIC หน้างาน (TIKUM_VENUE_PIC)', 'ผู้ซื้อ 9% + ผู้ขาย 9% (ขั้นต่ำ IDR 35,000, สูงสุด IDR 450,000/ใบ)', 'รวมทีม Event PIC หน้างาน ช่วยแลกสายรัดข้อมือและสนับสนุนการตรวจที่ประตูทางเข้า'],
        ['เพดานการบวกราคาสูงสุด', 'สูงสุด +30% จากราคาหน้าบัตร', 'ป้องกันการโก่งราคาเกินควรและรักษาราคาที่เป็นธรรม'],
        ['ราคาบัตรขั้นต่ำ', 'IDR 500,000 / ใบ', 'เกณฑ์ขั้นต่ำเพื่อรักษามาตรฐานการคัดกรองบัตรคอนเสิร์ตและเทศกาล']
      ],
      flowHeading: 'รายละเอียดเส้นทางเงินและระบบ DOKU Hold & Release',
      flowBodyHtml: 'ดูวิธีการบริหารจัดการยอดชำระในระบบบัญชีคู่ของ TIKUM ได้ที่: <a href="/payment-flow" style="color:#E36F45; font-weight:700; text-decoration:underline;">ดูสถาปัตยกรรมเส้นทางเงิน (/payment-flow)</a>',
      faqs: [
        { q: 'มีค่าธรรมเนียมแอบแฝงในหน้าชำระเงินหรือไม่?', a: 'ไม่มี ค่าธรรมเนียม Dual-Tier V2 ทั้งหมดแสดงอยู่ในใบเสนอราคาอย่างชัดเจนก่อนยืนยันคำสั่งซื้อ' },
        { q: 'หากงานอีเวนต์ถูกยกเลิก จะได้รับคืนค่าธรรมเนียมหรือไม่?', a: 'หากผู้จัดงานยกเลิกงานอย่างเป็นทางการ ผู้ซื้อจะได้รับเงินคืนเต็มจำนวนตามนโยบายการคืนเงิน' }
      ]
    }
  },
  sellerTerms: {
    id: {
      title: 'Ketentuan & Kewajiban Penjual (Seller Terms) | Tikum',
      description: 'Aturan pendaftaran tiket, kewajiban keaslian, jadwal pencairan dana, dan sanksi penjual di Tikum.',
      h1: 'Ketentuan Penjual (Seller Terms & Obligations)',
      subtitle: 'Standar operasional, jaminan keaslian tiket, dan ketentuan pencairan dana bagi penjual.',
      breadcrumb: 'Ketentuan Penjual',
      heading: 'Kewajiban & Standar Pendaftaran Tiket Penjual',
      items: [
        { color: '#38bdf8', title: '1. Jaminan Keaslian & Hak Milik Tiket', body: 'Penjual menjamin bahwa tiket yang didaftarkan adalah tiket asli dari promotor resmi, sah untuk akses masuk ke venue, dimiliki langsung oleh penjual, dan tidak sedang didaftarkan atau dijual di tempat lain.' },
        { color: '#f59e0b', title: '2. Bukti Kepemilikan Wajib', body: 'Sebelum listing diaktifkan, penjual wajib mengunggah bukti e-voucher resmi, bukti invoice pembelian, dan nomor barcode/booking reference yang jelas untuk verifikasi tim operasional.' },
        { color: '#10b981', title: '3. Jadwal Pencairan Dana Bersyarat', body: 'Dana hasil penjualan ditahan secara aman dalam sistem penahanan transaksi platform dan baru dapat dicairkan ke rekening bank penjual setelah acara selesai serta masa peninjauan sengketa gerbang 1x24 jam berlalu tanpa adanya laporan sengketa masuk.' },
        { color: '#f87171', border: '#ef4444', title: '4. Konsekuensi Pembatalan & Tiket Tidak Valid', body: 'Apabila penjual gagal menyerahkan tiket atau tiket terbukti tidak valid di gerbang acara, pembeli berhak menerima pengembalian dana penuh sesuai Kebijakan Refund, pencairan dana ke penjual dibatalkan (nol rupiah), akun penjual dapat diblokir permanen, dan penjual dapat dimintakan pertanggungjawaban ganti rugi sesuai ketentuan peraturan perundang-undangan yang berlaku (menunggu peninjauan legal).' }
      ],
      faqs: [
        { q: 'Kapan dana hasil penjualan ditransfer ke rekening penjual?', a: 'Pencairan dana disetujui dan ditransfer setelah acara selesai dan masa peninjauan sengketa 1x24 jam berakhir tanpa klaim gagal masuk.' }
      ]
    },
    en: {
      title: 'Seller Obligations & Listing Terms | Tikum',
      description: 'Rules, obligations, and payout terms for ticket sellers on Tikum secondary ticket marketplace.',
      h1: 'Seller Obligations & Listing Terms',
      subtitle: 'Operational standards, authenticity warranties, and payout policies for ticket sellers.',
      breadcrumb: 'Seller Terms',
      heading: 'Seller Obligations & Listing Standards',
      items: [
        { color: '#38bdf8', title: '1. Ticket Authenticity Warranty', body: 'Sellers explicitly warrant that each ticket listed is genuine, valid for event entry, owned by the seller, and unencumbered by prior redemptions or duplicate listings.' },
        { color: '#f59e0b', title: '2. Mandatory Ownership Evidence', body: 'Prior to approval, sellers must provide verifiable evidence: original ticketing confirmation, unredacted barcode identifiers, and seat assignment details.' },
        { color: '#10b981', title: '3. Conditional Payout Schedule', body: 'Sales proceeds are held by the platform and disbursed to the seller after the event has concluded and a 24-hour review window has passed without turnstile gate disputes.' },
        { color: '#f87171', border: '#ef4444', title: '4. Default & Invalid Ticket Consequences', body: 'If a seller fails to transfer a ticket or the ticket is proven invalid at the venue turnstile, the buyer is refunded in full under our Refund Policy, seller payout is cancelled (zero payout), the seller account may be permanently blocked, and the seller may be liable for damages under applicable law (pending legal review).' }
      ],
      faqs: [
        { q: 'When do sellers receive payout after selling a ticket?', a: 'Payouts are approved and released following successful event entry and after a 24-hour dispute review window expires.' }
      ]
    },
    ms: {
      title: 'Kewajipan Penjual & Terma Penyenaraian | Tikum',
      description: 'Peraturan, kewajipan dan terma pembayaran untuk penjual tiket di pasaran Tikum.',
      h1: 'Kewajipan Penjual & Terma Penyenaraian',
      subtitle: 'Piawaian operasi, jaminan keaslian dan dasar pembayaran untuk penjual tiket.',
      breadcrumb: 'Terma Penjual',
      heading: 'Kewajipan & Piawaian Penyenaraian Penjual',
      items: [
        { color: '#38bdf8', title: '1. Jaminan Keaslian Tiket', body: 'Penjual menjamin setiap tiket yang disenaraikan adalah tulen, sah untuk kemasukan acara, dimiliki sendiri dan tidak disenaraikan di tempat lain.' },
        { color: '#f59e0b', title: '2. Bukti Pemilikan Wajib', body: 'Sebelum kelulusan, penjual mesti menyediakan pengesahan pembelian asal, pengecam kod bar yang sah dan maklumat tempat duduk.' },
        { color: '#10b981', title: '3. Jadual Pembayaran Bersyarat', body: 'Hasil jualan dipegang oleh platform dan dilepaskan selepas acara tamat dan tetingkap semakan 24 jam berakhir tanpa pertikaian pintu masuk.' },
        { color: '#f87171', border: '#ef4444', title: '4. Akibat Kegagalan & Tiket Tidak Sah', body: 'Jika penjual gagal menyerahkan tiket atau tiket tidak sah di pintu masuk, pembeli menerima bayaran balik penuh, bayaran penjual dibatalkan dan akaun penjual boleh digantung kekal.' }
      ],
      faqs: [
        { q: 'Bilakah penjual menerima bayaran selepas tiket terjual?', a: 'Pembayaran diluluskan selepas kemasukan berjaya dan tempoh semakan 24 jam tamat tanpa pertikaian.' }
      ]
    },
    tl: {
      title: 'Mga Obligasyon ng Nagbebenta at Tuntunin ng Listing | Tikum',
      description: 'Mga panuntunan, obligasyon, at tuntunin sa payout para sa mga nagbebenta ng tiket sa Tikum.',
      h1: 'Mga Obligasyon ng Nagbebenta at Tuntunin ng Listing',
      subtitle: 'Mga pamantayan sa operasyon, garantiya ng pagiging tunay, at patakaran sa payout para sa mga nagbebenta.',
      breadcrumb: 'Tuntunin ng Nagbebenta',
      heading: 'Mga Obligasyon ng Nagbebenta at Pamantayan',
      items: [
        { color: '#38bdf8', title: '1. Garantiya ng Pagiging Tunay ng Tiket', body: 'Tinitiyak ng nagbebenta na ang bawat tiket ay tunay, wasto para sa pagpasok, pagmamay-ari ng nagbebenta, at walang dobleng listing.' },
        { color: '#f59e0b', title: '2. Kinakailangang Patunay ng Pagmamay-ari', body: 'Bago maaprubahan, dapat magbigay ang nagbebenta ng opisyal na patunay ng pagbili, barcode identifier, at detalye ng upuan.' },
        { color: '#10b981', title: '3. Kondisyonal na Iskedyul ng Payout', body: 'Ang kita ay itinatago ng platform at ilalabas lamang matapos ang kaganapan at 24-oras na review window nang walang alitan.' },
        { color: '#f87171', border: '#ef4444', title: '4. Kahihinatnan ng Hindi Paghahatid o Pekeng Tiket', body: 'Kung nabigong maglipat o napatunayang hindi wasto ang tiket sa turnstile, ibabalik nang buo ang bayad ng mamimili, kakanselahin ang payout ng nagbebenta, at maaaring permanenteng i-block ang account.' }
      ],
      faqs: [
        { q: 'Kailan natatanggap ng nagbebenta ang payout?', a: 'Inaaprubahan at inilalabas ang payout matapos ang matagumpay na pagpasok at 24-oras na dispute review window.' }
      ]
    },
    th: {
      title: 'ข้อกำหนดและหน้าที่ของผู้ขายบัตร | Tikum',
      description: 'กฎระเบียบ หน้าที่ความรับผิดชอบ และเงื่อนไขการจ่ายเงินสำหรับผู้ขายบัตรบนตลาด Tikum',
      h1: 'ข้อกำหนดและหน้าที่ของผู้ขาย (Seller Terms)',
      subtitle: 'มาตรฐานการดำเนินงาน การรับรองความถูกต้องของบัตร และเงื่อนไขการจ่ายเงินสำหรับผู้ขาย',
      breadcrumb: 'ข้อกำหนดผู้ขาย',
      heading: 'หน้าที่และมาตรฐานการลงรายการขายของผู้ขาย',
      items: [
        { color: '#38bdf8', title: '1. การรับรองความแท้จริงและกรรมสิทธิ์บัตร', body: 'ผู้ขายรับรองว่าบัตรทุกรายการเป็นบัตรแท้จากผู้จัดงาน ใช้เข้างานได้จริง เป็นกรรมสิทธิ์ของผู้ขาย และไม่ได้ลงขายซ้ำในช่องทางอื่น' },
        { color: '#f59e0b', title: '2. หลักฐานการเป็นเจ้าของที่ต้องยื่น', body: 'ก่อนอนุมัติรายการ ผู้ขายต้องอัปโหลดหลักฐาน e-voucher ทางการ ใบยืนยันการสั่งซื้อ และข้อมูลบาร์โค้ดที่ตรวจสอบได้' },
        { color: '#10b981', title: '3. กำหนดการโอนเงินแบบมีเงื่อนไข', body: 'รายได้จากการขายจะถูกพักไว้ในระบบและโอนเข้าบัญชีผู้ขายหลังจบงานและพ้นระยะตรวจสอบ 24 ชั่วโมงโดยไม่มีข้อพิพาทหน้าประตูงาน' },
        { color: '#f87171', border: '#ef4444', title: '4. ผลกรณีผิดนัดส่งมอบหรือบัตรไม่ถูกต้อง', body: 'หากผู้ขายไม่ส่งมอบบัตรหรือบัตรถูกปฏิเสธที่ประตูทางเข้า ผู้ซื้อจะได้รับเงินคืนเต็มจำนวน ยกเลิกยอดจ่ายผู้ขาย และบัญชีผู้ขายอาจถูกระงับถาวร' }
      ],
      faqs: [
        { q: 'ผู้ขายจะได้รับเงินเมื่อใดหลังขายบัตรสำเร็จ?', a: 'การจ่ายเงินจะได้รับอนุมัติและโอนออกหลังจบงานและพ้นช่วงตรวจสอบข้อพิพาท 24 ชั่วโมงเรียบร้อยแล้ว' }
      ]
    }
  },
  resalePolicy: {
    id: {
      title: 'Kebijakan Penjualan Kembali Tiket (Resale Policy) | Tikum',
      description: 'Kebijakan resmi penjualan kembali tiket sekunder di Tikum: batas markup maksimal 30%, ketentuan promotor, metode transfer, dan larangan listing.',
      h1: 'Kebijakan Penjualan Kembali Tiket (Resale Policy)',
      subtitle: 'Panduan transaksi adil, batas markup harga, metode serah terima tiket, dan kepatuhan aturan promotor.',
      breadcrumb: 'Kebijakan Resale',
      roleTitle: 'Peran Platform: Fasilitator Informasi & Pembayaran',
      roleBody: 'TIKUM (dioperasikan oleh PT SHINERVA PRAJNA TEJAS) adalah platform teknologi penyedia informasi dan fasilitasi pembayaran untuk transaksi tiket sekunder antar-pengguna secara independen. TIKUM bukan penerbit tiket resmi, loket penjualan tiket primer, promotor, maupun panitia penyelenggara acara. TIKUM tidak memiliki, mencetak, atau menerbitkan ulang tiket acara.',
      capTitle: 'Batas Markup Maksimum: Maksimal +30%',
      capLead: 'Guna mencegah praktik percaloan liar dan spekulasi harga yang merugikan penikmat acara, TIKUM memberlakukan batas atas harga jual tiket yang divalidasi langsung oleh sistem:',
      capBullets: [
        '<strong>Batas Markup Maksimal:</strong> Maksimal +30% di atas harga nominal resmi (Face Value) yang ditetapkan promotor (<code style="color:#f59e0b;">MAX_MARKUP_PCT: 30</code>). Pendaftaran tiket dengan harga melebihi batas ini ditolak otomatis oleh sistem.',
        '<strong>Batas Harga Minimum Listing:</strong> Rp 500.000 per tiket (<code style="color:#38bdf8;">MIN_LISTING_PRICE_IDR: 500.000</code>).',
        '<strong>Transparansi Penuh:</strong> Tanpa mark-up tersembunyi; seluruh komponen biaya diinformasikan sebelum konfirmasi pembayaran.'
      ],
      restrictTitle: 'Batasan Pemindahtanganan dari Promotor & Peringatan Pembeli',
      restrictBody: 'Sebagian promotor atau penyelenggara acara mencantumkan ketentuan khusus dalam syarat pembelian tiket resmi yang membatasi, melarang, atau menyatakan tidak berlakunya tiket yang dipindahtangankan kepada pihak lain.',
      restrictNoticeTitle: 'Pemberitahuan & Persetujuan Wajib Pembeli Sebelum Pembayaran:',
      restrictNoticeBody: 'Sebelum menyelesaikan pemesanan di halaman <a href="/pay" style="color:#38bdf8;">/pay</a>, pembeli diwajibkan membaca dan mencentang kotak persetujuan eksplisit bahwa pembeli memahami adanya risiko batasan pemindahtanganan dari promotor. Apabila tiket terbukti ditolak di turnstile gerbang venue atau dibatalkan sepihak oleh promotor, pembeli tetap dilindungi oleh prosedur sengketa dan pengembalian dana penuh sesuai Kebijakan Refund.',
      methodsTitle: 'Metode Pemindahtanganan yang Didukung',
      methods: [
        '<strong>Transfer E-Ticket / PDF Resmi:</strong> Pengunggahan berkas e-voucher resmi yang memuat barcode/QR code sah dari kanal tiket primer.',
        '<strong>Pengalihan Akun / Booking Resmi:</strong> Mekanisme transfer resmi melalui platform tiket primer apabila fitur transfer akun didukung oleh promotor.',
        '<strong>Serah Terima Fisik / Wristband di Lokasi Acara:</strong> Penyerahan gelang fisik di lokasi venue yang dikoordinasikan bersama Event PIC TIKUM pada event terpilih selama jam buka gerbang.'
      ],
      prohibitedTitle: 'Daftar Listing yang Dilarang (Prohibited Listings)',
      prohibited: [
        'Tiket palsu, hasil manipulasi dokumen digital, atau duplikasi barcode (dicegah melalui verifikasi hash SHA-256).',
        'Tiket undangan / complimentary pass bertanda \'Not for Sale\' atau \'Tidak untuk Dijual\'.',
        'Tiket yang diperoleh dari tindak kejahatan siber, carding, penipuan, atau peretasan akun.',
        'Listing dengan harga melebihi batas markup maksimum 30% dari Face Value.',
        'Tiket untuk acara yang telah selesai, kedaluwarsa, atau telah resmi dibatalkan promotor.'
      ],
      faqs: [
        { q: 'Apakah TIKUM menjual tiket resmi dari promotor?', a: 'Bukan. TIKUM adalah marketplace perantara tiket sekunder independen yang memfasilitasi transaksi aman antar-penggemar.' },
        { q: 'Berapa batas markup harga tiket yang diperbolehkan di TIKUM?', a: 'Harga tiket dibatasi maksimal +30% di atas harga resmi (Face Value) promotor untuk mencegah percaloan liar.' },
        { q: 'Bagaimana jika promotor melarang pemindahtanganan tiket?', a: 'Pembeli diberi peringatan eksplisit sebelum membayar. Jika tiket terbukti ditolak di turnstile gerbang acara dengan bukti sah, dana dilindungi sesuai Kebijakan Refund.' }
      ]
    },
    en: {
      title: 'Secondary Ticket Resale Policy | Tikum',
      description: 'Official resale policy: markup caps (+30%), organizer transfer restrictions, supported delivery methods, and prohibited listings on Tikum.',
      h1: 'Secondary Ticket Resale Policy',
      subtitle: 'Fair market guidelines, markup limits, supported handover protocols, and organizer restrictions.',
      breadcrumb: 'Resale Policy',
      roleTitle: 'Platform Role: Information & Payment Intermediary',
      roleBody: 'TIKUM (operated by PT SHINERVA PRAJNA TEJAS) is a technology platform providing information and payment facilitation for secondary ticket transactions between independent consumers. TIKUM is not a primary ticket issuer, box office, organizer, or promoter. We do not own, create, or re-issue event tickets.',
      capTitle: 'Maximum Markup Cap: Max +30%',
      capLead: 'To deter predatory scalping and keep live event access fair for fans, TIKUM enforces a strict server-validated markup ceiling:',
      capBullets: [
        '<strong>Maximum Markup Cap:</strong> Maximum +30% above the official promoter face value (<code style="color:#f59e0b;">MAX_MARKUP_PCT: 30</code>). Submissions exceeding this threshold are automatically rejected by our pricing engine.',
        '<strong>Minimum Listing Floor:</strong> IDR 500,000 per ticket (<code style="color:#38bdf8;">MIN_LISTING_PRICE_IDR: 500,000</code>).',
        '<strong>Transparent Pricing:</strong> Zero hidden checkout markups; all fees are disclosed before order placement.'
      ],
      restrictTitle: 'Organizer Transfer Restrictions & Disclaimers',
      restrictBody: 'Some event organizers and promoters incorporate terms in their primary ticketing conditions that restrict, prohibit, or invalidate tickets resold or transferred outside their proprietary channels.',
      restrictNoticeTitle: 'Buyer Notice & Pre-Payment Acknowledgment:',
      restrictNoticeBody: 'Before completing any order on TIKUM, buyers are explicitly presented with a dedicated warning and must check an acknowledgment box confirming they understand organizer resale restrictions. If an organizer revokes a ticket category or entry is denied with evidence, the buyer remains protected under TIKUM official Refund Policy.',
      methodsTitle: 'Supported Transfer Methods',
      methods: [
        '<strong>Official E-Ticket / PDF Transfer:</strong> Secure upload of authentic promoter e-voucher with unique barcode or QR code.',
        '<strong>Primary Account Transfer / Delegation:</strong> Transfer through official primary ticketing portal mechanisms where supported by the primary ticketing provider.',
        '<strong>On-Site Physical / Wristband Handover:</strong> Handover coordinated with Event PIC on-site assistance at selected events during designated gate hours.'
      ],
      prohibitedTitle: 'Prohibited Listings',
      prohibited: [
        'Counterfeit, altered, or duplicate barcode tickets (cryptographically blocked by SHA-256 hash check).',
        'Complimentary, guest, or media passes marked \'Not for Sale\' / \'Not for Resale\'.',
        'Tickets acquired via fraudulent means, identity theft, or unauthorized card transactions.',
        'Listings priced in excess of the +30% maximum markup cap.',
        'Tickets for events that have concluded, expired, or been officially cancelled.'
      ],
      faqs: [
        { q: 'Is TIKUM an official primary ticket box office?', a: 'No. TIKUM is an independent secondary ticket marketplace intermediary facilitating safe peer-to-peer ticket transactions.' },
        { q: 'What is the maximum markup allowed on ticket listings?', a: 'Listings cannot exceed +30% above the promoter official face value. Our system automatically blocks listings that exceed this cap.' },
        { q: 'What if an organizer prohibits ticket transfer?', a: 'Buyers are notified of organizer restrictions before payment and must explicitly acknowledge them. If entry is denied at the turnstile with evidence, the buyer is protected under our Refund Policy.' }
      ]
    },
    ms: {
      title: 'Dasar Jualan Semula Tiket Sekunder | Tikum',
      description: 'Dasar jualan semula rasmi: had tokokan (+30%), sekatan penganjur, kaedah serahan yang disokong dan penyenaraian dilarang.',
      h1: 'Dasar Jualan Semula Tiket Sekunder',
      subtitle: 'Garis panduan pasaran adil, had tokokan harga, protokol serahan dan pematuhan peraturan penganjur.',
      breadcrumb: 'Dasar Jualan Semula',
      roleTitle: 'Peranan Platform: Perantara Maklumat & Pembayaran',
      roleBody: 'TIKUM (dikendalikan oleh PT SHINERVA PRAJNA TEJAS) ialah platform teknologi yang memudahkan maklumat dan pembayaran bagi transaksi tiket sekunder antara pengguna bebas dan bukan penerbit tiket utama.',
      capTitle: 'Had Tokokan Maksimum: Maks. +30%',
      capLead: 'Bagi mengelakkan aktiviti ulat tiket, TIKUM menguatkuasakan had harga jualan berikut secara automatik:',
      capBullets: [
        '<strong>Had Tokokan Maksimum:</strong> Maksimum +30% melebihi harga muka rasmi penganjur (<code style="color:#f59e0b;">MAX_MARKUP_PCT: 30</code>).',
        '<strong>Harga Minimum Penyenaraian:</strong> IDR 500,000 setiap tiket.',
        '<strong>Ketelusan Penuh:</strong> Tiada caj tersembunyi semasa checkout.'
      ],
      restrictTitle: 'Sekatan Pemindahan Penganjur & Penafian',
      restrictBody: 'Sesetengah penganjur acara menetapkan syarat yang menyekat pemindahan tiket di luar saluran rasmi mereka.',
      restrictNoticeTitle: 'Makluman & Pengakuan Wajib Pembeli:',
      restrictNoticeBody: 'Sebelum menyelesaikan pesanan di <a href="/pay" style="color:#38bdf8;">/pay</a>, pembeli wajib membaca amaran dan mengakui sekatan penganjur. Jika kemasukan ditolak di pintu masuk dengan bukti sah, pembeli tetap dilindungi di bawah Dasar Bayaran Balik.',
      methodsTitle: 'Kaedah Pemindahan yang Disokong',
      methods: [
        '<strong>Pindahan E-Tiket / PDF Rasmi:</strong> Muat naik e-baucar asal penganjur dengan kod bar/QR unik.',
        '<strong>Pindahan Akaun Primer Rasmi:</strong> Pindahan melalui mekanisme portal rasmi jika disokong oleh penganjur.',
        '<strong>Serahan Fizikal / Gelang di Lokasi:</strong> Diselaraskan bersama Event PIC pada acara terpilih semasa waktu operasi pintu.'
      ],
      prohibitedTitle: 'Penyenaraian Dilarang',
      prohibited: [
        'Tiket palsu, diubah suai atau kod bar pendua (disekat oleh semakan cincangan SHA-256).',
        'Pas jemputan atau media bertanda \'Not for Sale\'.',
        'Tiket yang diperoleh melalui penipuan atau akses tidak sah.',
        'Penyenaraian melebihi had tokokan maksimum +30% daripada harga muka.',
        'Tiket bagi acara yang telah tamat atau dibatalkan secara rasmi.'
      ],
      faqs: [
        { q: 'Adakah TIKUM kaunter tiket utama penganjur?', a: 'Tidak. TIKUM ialah pasaran perantara tiket sekunder bebas antara peminat.' },
        { q: 'Berapakah had tokokan maksimum yang dibenarkan?', a: 'Harga tiket dihadkan maksimum +30% daripada harga muka rasmi penganjur.' },
        { q: 'Bagaimana jika penganjur melarang pemindahan tiket?', a: 'Pembeli dimaklumkan sebelum membayar. Jika ditolak di pintu masuk dengan bukti sah, dana dilindungi di bawah Dasar Bayaran Balik.' }
      ]
    },
    tl: {
      title: 'Patakaran sa Pangalawang Pagbebenta ng Tiket | Tikum',
      description: 'Opisyal na patakaran sa muling pagbebenta: +30% markup cap, mga paghihigpit ng organizer, at ipinagbabawal na listing.',
      h1: 'Patakaran sa Pangalawang Pagbebenta ng Tiket',
      subtitle: 'Mga alituntunin sa patas na merkado, limitasyon sa markup, at mga sinusuportahang paraan ng paglipat.',
      breadcrumb: 'Patakaran sa Resale',
      roleTitle: 'Papel ng Platform: Tagapamagitan ng Impormasyon at Pagbabayad',
      roleBody: 'Ang TIKUM (pinamamahalaan ng PT SHINERVA PRAJNA TEJAS) ay isang platform ng teknolohiya para sa impormasyon at pagpapadali ng bayad para sa pangalawang transaksyon ng tiket at hindi pangunahing tagapaglabas ng tiket.',
      capTitle: 'Pinakamataas na Markup Cap: Max +30%',
      capLead: 'Upang maiwasan ang scalping, nagpapatupad ang TIKUM ng mahigpit na limitasyon sa presyo:',
      capBullets: [
        '<strong>Pinakamataas na Markup Cap:</strong> Maximum na +30% higit sa opisyal na face value (<code style="color:#f59e0b;">MAX_MARKUP_PCT: 30</code>).',
        '<strong>Pinakamababang Presyo ng Listing:</strong> IDR 500,000 bawat tiket.',
        '<strong>Buong Kalinawan:</strong> Walang nakatagong bayarin sa checkout.'
      ],
      restrictTitle: 'Mga Paghihigpit ng Organizer sa Paglipat ng Tiket',
      restrictBody: 'May ilang organizer na naglilimita o nagbabawal ng paglipat ng tiket sa labas ng kanilang opisyal na channel.',
      restrictNoticeTitle: 'Paunawa at Pagkilala ng Mamimili Bago Magbayad:',
      restrictNoticeBody: 'Bago kumpletuhin ang order sa <a href="/pay" style="color:#38bdf8;">/pay</a>, kinakailangang kilalanin ng mamimili ang mga paghihigpit ng organizer. Kung tinanggihan sa gate na may ebidensya, protektado ka pa rin ng Patakaran sa Refund.',
      methodsTitle: 'Mga Sinusuportahang Paraan ng Paglipat',
      methods: [
        '<strong>Opisyal na E-Ticket / PDF Transfer:</strong> Pag-upload ng tunay na e-voucher na may natatanging barcode/QR.',
        '<strong>Primary Account Transfer:</strong> Opisyal na paglipat sa portal ng pangunahing ticketing provider kung sinusuportahan.',
        '<strong>Pisikal / Wristband Handover sa Venue:</strong> Paglipat kasama ang Event PIC sa mga piling kaganapan.'
      ],
      prohibitedTitle: 'Mga Ipinagbabawal na Listing',
      prohibited: [
        'Mga peke, binago, o dobleng barcode na tiket (hinaharangan ng SHA-256 hash check).',
        'Mga complimentary o media pass na may markang \'Not for Sale\'.',
        'Mga tiket na nakuha sa pamamagitan ng panloloko o hindi awtorisadong transaksyon.',
        'Mga listing na lumalampas sa +30% markup cap.',
        'Mga tiket para sa mga natapos o nakanselang kaganapan.'
      ],
      faqs: [
        { q: 'Opisyal na ticket box office ba ang TIKUM?', a: 'Hindi. Ang TIKUM ay isang independiyenteng secondary ticket marketplace.' },
        { q: 'Ano ang pinakamataas na markup na pinapayagan?', a: 'Hindi maaaring lumampas sa +30% higit sa opisyal na face value ng promoter.' },
        { q: 'Paano kung ipinagbabawal ng organizer ang paglipat?', a: 'Pinapaalalahanan ang mamimili bago magbayad. Kung tinanggihan sa gate na may ebidensya, saklaw ito ng Patakaran sa Refund.' }
      ]
    },
    th: {
      title: 'นโยบายการซื้อขายบัตรมือสอง | Tikum',
      description: 'นโยบายทางการสำหรับการซื้อขายบัตรมือสองบน Tikum: เพดานบวกราคา +30%, ข้อจำกัดของผู้จัดงาน และรายการต้องห้าม',
      h1: 'นโยบายการซื้อขายบัตรมือสอง (Resale Policy)',
      subtitle: 'แนวทางการซื้อขายที่เป็นธรรม เพดานการบวกราคา วิธีการส่งมอบ และข้อกำหนดของผู้จัดงาน',
      breadcrumb: 'นโยบายการขายต่อ',
      roleTitle: 'บทบาทของแพลตฟอร์ม: ตัวกลางข้อมูลและการชำระเงิน',
      roleBody: 'TIKUM (ดำเนินการโดย PT SHINERVA PRAJNA TEJAS) เป็นแพลตฟอร์มเทคโนโลยีตัวกลางสำหรับข้อมูลและอำนวยความสะดวกในการชำระเงินระหว่างผู้บริโภค ไม่ใช่ผู้จำหน่ายบัตรหลักหรือผู้จัดงาน และไม่ได้ออกหรือพิมพ์บัตรใหม่',
      capTitle: 'เพดานการบวกราคาสูงสุด: ไม่เกิน +30%',
      capLead: 'เพื่อป้องกันการเก็งกำไรเกินควร TIKUM บังคับใช้เพดานราคาที่ตรวจสอบโดยระบบโดยอัตโนมัติ:',
      capBullets: [
        '<strong>เพดานการบวกราคาสูงสุด:</strong> ไม่เกิน +30% จากราคาหน้าบัตรทางการของผู้จัดงาน (<code style="color:#f59e0b;">MAX_MARKUP_PCT: 30</code>)',
        '<strong>ราคาลงขายขั้นต่ำ:</strong> IDR 500,000 ต่อบัตร 1 ใบ',
        '<strong>ความโปร่งใสเต็มรูปแบบ:</strong> ไม่มีค่าธรรมเนียมซ่อนเร้นในหน้าชำระเงิน'
      ],
      restrictTitle: 'ข้อจำกัดการโอนบัตรของผู้จัดงานและคำชี้แจง',
      restrictBody: 'ผู้จัดงานบางรายอาจมีเงื่อนไขจำกัดหรือห้ามการโอนกรรมสิทธิ์บัตรนอกช่องทางจำหน่ายหลักของผู้จัดงาน',
      restrictNoticeTitle: 'คำเตือนและการรับทราบของผู้ซื้อก่อนชำระเงิน:',
      restrictNoticeBody: 'ก่อนทำรายการชำระเงินที่ <a href="/pay" style="color:#38bdf8;">/pay</a> ผู้ซื้อจะต้องอ่านคำเตือนและกดรับทราบเงื่อนไขข้อจำกัดของผู้จัดงาน หากบัตรถูกปฏิเสธที่ประตูทางเข้าและมีหลักฐานชัดเจน ผู้ซื้อยังคงได้รับการคุ้มครองตามนโยบายการคืนเงิน',
      methodsTitle: 'วิธีการส่งมอบบัตรที่รองรับ',
      methods: [
        '<strong>การโอน E-Ticket / PDF ทางการ:</strong> อัปโหลด e-voucher แท้ที่มีบาร์โค้ด/QR เฉพาะ',
        '<strong>การโอนผ่านบัญชีผู้จำหน่ายหลัก:</strong> การโอนสิทธิ์ผ่านระบบของตัวแทนจำหน่ายหลักหากผู้จัดงานรองรับ',
        '<strong>การนัดรับบัตรจริง / สายรัดข้อมือหน้างาน:</strong> ประสานงานร่วมกับ Event PIC ที่ประตูทางเข้าในงานที่ร่วมรายการ'
      ],
      prohibitedTitle: 'รายการต้องห้ามลงขาย',
      prohibited: [
        'บัตรปลอม บัตรดัดแปลง หรือบาร์โค้ดซ้ำ (บล็อกอัตโนมัติด้วย SHA-256)',
        'บัตรอภินันทนาการหรือบัตรสื่อมวลชนที่ระบุว่าห้ามจำหน่าย (Not for Sale)',
        'บัตรที่ได้มาจากการทุจริตหรือการเข้าถึงบัญชีโดยไม่ได้รับอนุญาต',
        'รายการที่ตั้งราคาเกินเพดาน +30% จากราคาหน้าบัตร',
        'บัตรของงานที่สิ้นสุดแล้วหรือถูกยกเลิกอย่างเป็นทางการ'
      ],
      faqs: [
        { q: 'TIKUM เป็นตัวแทนจำหน่ายบัตรหลักหรือไม่?', a: 'ไม่ใช่ TIKUM เป็นแพลตฟอร์มตลาดซื้อขายบัตรมือสองอิสระระหว่างแฟนงานอีเวนต์' },
        { q: 'อนุญาตให้บวกราคาได้สูงสุดเท่าใด?', a: 'ไม่เกิน +30% จากราคาหน้าบัตรทางการ ระบบจะปฏิเสธรายการที่เกินเพดานโดยอัตโนมัติ' },
        { q: 'หากผู้จัดงานห้ามโอนบัตรจะทำอย่างไร?', a: 'ผู้ซื้อจะได้รับแจ้งคำเตือนก่อนชำระเงิน และหากถูกปฏิเสธที่ประตูเข้างานพร้อมหลักฐาน จะได้รับการคุ้มครองตามนโยบายการคืนเงิน' }
      ]
    }
  },
  paymentFlow: {
    id: {
      title: 'Alur Dana & Proses Penyelesaian Transaksi Platform | Tikum',
      description: 'Dokumentasi transparan alur dana buku besar berpasangan TIKUM: penampungan dana penjual, syarat pencairan, alur refund, dan SLA sengketa.',
      h1: 'Alur Dana & Tata Kelola Pembukuan Platform',
      subtitle: 'Tata kelola pergerakan dana transparan yang dicatat dalam sistem buku besar berpasangan tanpa klaim escrow perbankan.',
      breadcrumb: 'Alur Dana',
      badge: 'Sistem Pembukuan Akuntansi Berpasangan',
      archTitle: 'Transparansi Alur Dana & Tata Kelola Transaksi',
      archBody: 'TIKUM mengelola alur dana transaksi tiket menggunakan sistem buku besar akuntansi berpasangan internal (<code style="color:#38bdf8;">FinancialLedger</code>). Ketika pembeli membayar, dana masuk ke saldo kliring payment gateway resmi dan dicatat secara administratif di bawah kontrol sistem platform.',
      nonBankTitle: 'Klarifikasi Pengelolaan Dana Bukan Rekening Escrow Perbankan:',
      nonBankBody: 'Penahanan dana dalam sistem TIKUM adalah tata kelola administrasi transaksi internal platform dan <strong>BUKAN merupakan rekening escrow pada lembaga perbankan</strong>. TIKUM bukan lembaga perbankan. Seluruh perlindungan transaksi beroperasi melalui sistem akuntansi tertutup, syarat pencairan dana penjual pasca-acara selesai, dan validasi matematis yang ketat.',
      ledgerTitle: 'Akun Jurnal Buku Besar (Double-Entry Ledger)',
      ledgerLead: 'Setiap pergerakan transaksi dicatat dengan prinsip keseimbangan: <code style="color:#10b981;">Total Debit === Total Kredit</code>.',
      ledgerCols: ['Kode Akun Buku Besar', 'Klasifikasi Akun', 'Peran dalam Alur Transaksi'],
      ledgerRows: [
        ['PAYMENT_GATEWAY_CLEARING', '#38bdf8', 'Aset / Piutang Kliring', 'Didebit sebesar total pembayaran pembeli saat webhook payment gateway mengonfirmasi pembayaran berhasil.'],
        ['SELLER_PAYABLE_PENDING', '#f59e0b', 'Kewajiban / Hak Penjual', 'Dikredit sebesar hasil bersih hak penjual; dikunci dan ditahan hingga acara selesai tanpa sengketa.'],
        ['PLATFORM_FEE_REVENUE', '#F3EBDD', 'Pendapatan Layanan', 'Dikredit sebesar tarif layanan platform Dual-Tier V2 (6% Transfer Mandiri maks. Rp300rb/tiket atau 9% PIC Venue maks. Rp450rb/tiket; min. Rp35.000).'],
        ['PROVIDER_FEE_EXPENSE', '#cbd5e1', 'Beban / Kliring Gateway', 'Dikredit sebesar biaya pemrosesan gateway pembayaran resmi (Rp 5.000 per transaksi).'],
        ['SETTLEMENT_CLEARING', '#a855f7', 'Kliring Pengeluaran Bank', 'Dikredit saat pencairan dana ditransfer ke rekening bank penjual pasca-acara selesai.']
      ],
      releaseTitle: 'Syarat & Jadwal Pencairan Dana ke Penjual',
      releaseItems: [
        '<strong>Syarat Pelepasan:</strong> Pencairan dana ke penjual hanya diproses setelah acara selesai diselenggarakan dan masa sanggah verifikasi gerbang 1x24 jam berakhir tanpa adanya laporan sengketa masuk dari pembeli.',
        '<strong>Kecepatan Transfer:</strong> Dana yang disetujui dicairkan ditransfer ke rekening bank penjual terdaftar dalam waktu 1 (satu) hari kerja bank setelah verifikasi selesai.'
      ],
      refundTitle: 'Alur Pengembalian Dana & SLA Sengketa',
      refundLead: 'Jika pesanan dibatalkan atau sengketa pembeli disetujui (misalnya tiket ditolak di gerbang turnstile acara dan diverifikasi bukti oleh Event PIC), fungsi <code style="color:#f43f5e;">FinancialLedger.recordRefund()</code> membalikkan pencatatan kewajiban penjual secara otomatis dan mengembalikan penuh dana ke instrumen pembayaran asal pembeli dalam 1-3 hari kerja.',
      refundItems: [
        '<strong>Batas Pelaporan Sengketa:</strong> Maksimal 60 menit setelah gerbang venue dibuka atau selambatnya 1x24 jam setelah acara dimulai.',
        '<strong>SLA Peninjauan Bukti:</strong> 1x24 hingga 2x48 jam kerja oleh Trust Officer TIKUM.',
        '<strong>Eksekusi Pengembalian Dana:</strong> Dalam 1 hari kerja bank setelah persetujuan putusan sengketa.'
      ],
      regTitle: 'Catatan Kepatuhan & Regulasi',
      regBody: 'Proses pemeriksaan transaksi dan penyelesaian pembayaran oleh TIKUM dijalankan secara ketat melalui pencatatan buku besar administratif internal hingga verifikasi tiket selesai. Penerimaan pembayaran difasilitasi melalui mitra payment gateway resmi berizin Bank Indonesia sesuai regulasi yang berlaku.',
      faqs: [
        { q: 'Apakah dana saya disimpan di rekening escrow bank?', a: 'Bukan. Dana dikelola dalam sistem pembukuan berpasangan internal platform (FinancialLedger) dan baru dicairkan ke penjual setelah acara selesai tanpa sengketa.' },
        { q: 'Berapa lama proses pengembalian dana jika tiket bermasalah?', a: 'Setelah bukti kendala tiket di venue diverifikasi, dana dikembalikan penuh ke rekening/e-wallet pembeli dalam 1 hingga 3 hari kerja.' }
      ]
    },
    en: {
      title: 'Funds Flow & Platform-Held Ledger Architecture | Tikum',
      description: 'Comprehensive documentation of TIKUM double-entry ledger funds flow: payment capture, seller payable holding, disbursal release, and refund SLA.',
      h1: 'Funds Flow & Ledger Governance',
      subtitle: 'Transparent fund movement governed by double-entry ledger controls without third-party bank escrow claims.',
      breadcrumb: 'Funds Flow',
      badge: 'Platform-Held Accounting Controls',
      archTitle: 'Honest Funds Flow Architecture',
      archBody: 'TIKUM enforces an internal <strong>platform-held double-entry accounting ledger</strong> (<code style="color:#38bdf8;">FinancialLedger</code>). When a buyer completes payment, funds are received into our payment gateway clearing balance and accounted for administratively.',
      nonBankTitle: 'Non-Banking Custody Clarification:',
      nonBankBody: 'Funds held under platform transaction controls are <strong>NOT stored in a third-party bank escrow account</strong>. TIKUM is not a licensed banking institution. All payment protection operates through strict internal ledger controls, conditional post-event seller disbursal rules, and fail-closed financial invariant checks.',
      ledgerTitle: 'Double-Entry Journal Accounts',
      ledgerLead: 'Every transaction strictly satisfies the mathematical double-entry balance invariant: <code style="color:#10b981;">sum(Debits) === sum(Credits)</code>.',
      ledgerCols: ['Account Code', 'Classification', 'Role in Funds Flow'],
      ledgerRows: [
        ['PAYMENT_GATEWAY_CLEARING', '#38bdf8', 'Asset / Receivable', 'Debited with gross buyer inflow upon payment gateway webhook confirmation.'],
        ['SELLER_PAYABLE_PENDING', '#f59e0b', 'Liability / Pending Payout', 'Credited with net seller proceeds; locked until event completion and dispute window expiration.'],
        ['PLATFORM_FEE_REVENUE', '#F3EBDD', 'Revenue', 'Credited with Dual-Tier V2 platform fee (6% Seller-Managed max IDR 300k/ticket or 9% Venue PIC max IDR 450k/ticket; min IDR 35,000).'],
        ['PROVIDER_FEE_EXPENSE', '#cbd5e1', 'Expense / Clearing', 'Credited with pass-through payment gateway processing fee (IDR 5,000).'],
        ['SETTLEMENT_CLEARING', '#a855f7', 'Clearing / Disbursal', 'Credited when seller payout is executed post-event, clearing the SELLER_PAYABLE liability.']
      ],
      releaseTitle: 'Release Conditions & Timeline',
      releaseItems: [
        '<strong>Release Trigger:</strong> Disbursement to the seller is only released after the event has taken place and a 24-hour turnstile dispute window has concluded with zero unaddressed buyer claims.',
        '<strong>Disbursal Speed:</strong> Released payouts are transferred to the seller registered bank account within 1 (one) business day following verification.'
      ],
      refundTitle: 'Refund Path & Dispute SLA',
      refundLead: 'If an order is cancelled or a buyer dispute is upheld (e.g., turnstile rejection slip verified by Event PIC), <code style="color:#f43f5e;">FinancialLedger.recordRefund()</code> executes an atomic reversal of the seller payable liability and returns the funds in full to the buyer original payment method within 1-3 business days.',
      refundItems: [
        '<strong>Dispute Reporting Window:</strong> Within 60 minutes of venue gate opening or up to 24 hours post-event.',
        '<strong>Evidence Review SLA:</strong> 24 to 48 hours for Trust Officer investigation.',
        '<strong>Refund Execution:</strong> Within 1 business day of dispute approval.'
      ],
      regTitle: 'Regulatory & Compliance Notice',
      regBody: 'Transaction verification and settlement processing by TIKUM operate strictly under internal double-entry administrative controls until ticket admission verification concludes. Fund collection and payment processing are facilitated through licensed payment gateway partners in compliance with Bank Indonesia regulations.',
      faqs: [
        { q: 'Is my money held in a bank escrow account?', a: 'No. Funds are managed under internal platform-held accounting ledger controls (FinancialLedger) and disbursed to the seller only after successful event entry.' },
        { q: 'How long does a refund take if a ticket fails?', a: 'Refunds are approved upon evidence verification and processed back to the original payment method within 1 to 3 business days.' }
      ]
    },
    ms: {
      title: 'Aliran Dana & Seni Bina Lejar Pegangan Platform | Tikum',
      description: 'Dokumentasi aliran dana lejar berganda TIKUM: kutipan pembayaran, pegangan bayaran penjual, pelepasan dan SLA bayaran balik.',
      h1: 'Aliran Dana & Tadbir Urus Lejar',
      subtitle: 'Pergerakan dana telus yang ditadbir oleh kawalan lejar berganda tanpa dakwaan akaun escrow bank pihak ketiga.',
      breadcrumb: 'Aliran Dana',
      badge: 'Kawalan Perakaunan Pegangan Platform',
      archTitle: 'Seni Bina Aliran Dana Telus',
      archBody: 'TIKUM menguatkuasakan <strong>lejar perakaunan berganda pegangan platform</strong> dalaman (<code style="color:#38bdf8;">FinancialLedger</code>). Apabila pembeli membayar, dana diterima ke baki penjelasan gerbang pembayaran dan direkodkan secara pentadbiran.',
      nonBankTitle: 'Penjelasan Penjagaan Bukan Perbankan:',
      nonBankBody: 'Dana yang dipegang di bawah kawalan transaksi platform <strong>TIDAK disimpan dalam akaun escrow bank pihak ketiga</strong>. TIKUM bukan institusi perbankan berlesen.',
      ledgerTitle: 'Akaun Jurnal Lejar Berganda',
      ledgerLead: 'Setiap transaksi memenuhi keseimbangan matematik: <code style="color:#10b981;">Jumlah Debit === Jumlah Kredit</code>.',
      ledgerCols: ['Kod Akaun', 'Klasifikasi', 'Peranan dalam Aliran Dana'],
      ledgerRows: [
        ['PAYMENT_GATEWAY_CLEARING', '#38bdf8', 'Aset / Belum Terima', 'Didebitkan dengan jumlah pembayaran pembeli apabila webhook gerbang mengesahkan bayaran.'],
        ['SELLER_PAYABLE_PENDING', '#f59e0b', 'Liabiliti / Bayaran Tertunda', 'Dikreditkan dengan hasil bersih penjual sehingga acara selesai tanpa pertikaian.'],
        ['PLATFORM_FEE_REVENUE', '#F3EBDD', 'Hasil', 'Dikreditkan dengan yuran Dual-Tier V2 (6% maks IDR 300k/tiket atau 9% maks IDR 450k/tiket; min IDR 35,000).'],
        ['PROVIDER_FEE_EXPENSE', '#cbd5e1', 'Perbelanjaan / Penjelasan', 'Dikreditkan dengan yuran pemprosesan gerbang pembayaran rasmi (IDR 5,000).'],
        ['SETTLEMENT_CLEARING', '#a855f7', 'Penjelasan / Pelepasan', 'Dikreditkan apabila bayaran penjual dilaksanakan selepas acara tamat.']
      ],
      releaseTitle: 'Syarat & Garis Masa Pelepasan',
      releaseItems: [
        '<strong>Syarat Pelepasan:</strong> Pembayaran penjual hanya dilepaskan selepas acara selesai dan tetingkap pertikaian 24 jam berakhir tanpa tuntutan.',
        '<strong>Kelajuan Pemindahan:</strong> Dana dipindahkan ke akaun bank penjual dalam 1 hari bekerja selepas pengesahan.'
      ],
      refundTitle: 'Laluan Bayaran Balik & SLA Pertikaian',
      refundLead: 'Jika pesanan dibatalkan atau pertikaian disahkan, <code style="color:#f43f5e;">FinancialLedger.recordRefund()</code> membalikkan liabiliti dan memulangkan dana dalam 1-3 hari bekerja.',
      refundItems: [
        '<strong>Tempoh Laporan Pertikaian:</strong> Dalam 60 minit pembukaan pintu atau sehingga 24 jam pasca-acara.',
        '<strong>SLA Semakan Bukti:</strong> 24 hingga 48 jam oleh Pegawai Amanah.',
        '<strong>Pelaksanaan Bayaran Balik:</strong> Dalam 1 hari bekerja selepas kelulusan.'
      ],
      regTitle: 'Notis Pematuhan & Kawal Selia',
      regBody: 'Pemprosesan pembayaran difasilitasi melalui rakan gerbang pembayaran berlesen mengikut peraturan Bank Indonesia.',
      faqs: [
        { q: 'Adakah wang saya disimpan di akaun escrow bank?', a: 'Tidak. Dana diurus dalam kawalan lejar perakaunan dalaman platform dan dilepaskan kepada penjual hanya selepas kemasukan berjaya.' },
        { q: 'Berapa lamakah proses bayaran balik?', a: 'Setelah bukti disahkan, bayaran balik diproses ke kaedah pembayaran asal dalam 1 hingga 3 hari bekerja.' }
      ]
    },
    tl: {
      title: 'Daloy ng Pondo at Arkitektura ng Platform Ledger | Tikum',
      description: 'Dokumentasyon ng daloy ng pondo sa double-entry ledger ng TIKUM.',
      h1: 'Daloy ng Pondo at Pamamahala ng Ledger',
      subtitle: 'Malinaw na paggalaw ng pondo na pinamamahalaan ng double-entry ledger controls.',
      breadcrumb: 'Daloy ng Pondo',
      badge: 'Mga Kontrol sa Accounting ng Platform',
      archTitle: 'Malinaw na Arkitektura ng Daloy ng Pondo',
      archBody: 'Gumagamit ang TIKUM ng panloob na <strong>double-entry accounting ledger</strong> (<code style="color:#38bdf8;">FinancialLedger</code>) upang maitala nang malinaw ang bawat bayad ng mamimili.',
      nonBankTitle: 'Paglilinaw na Hindi Bangko ang Pangangalaga:',
      nonBankBody: 'Ang pondong hawak sa ilalim ng kontrol ng platform ay <strong>HINDI nakaimbak sa third-party bank escrow account</strong>. Ang TIKUM ay hindi isang bangko.',
      ledgerTitle: 'Mga Account sa Double-Entry Journal',
      ledgerLead: 'Ang bawat transaksyon ay sumusunod sa balanse: <code style="color:#10b981;">Kabuuang Debit === Kabuuang Credit</code>.',
      ledgerCols: ['Code ng Account', 'Klasipikasyon', 'Papel sa Daloy ng Pondo'],
      ledgerRows: [
        ['PAYMENT_GATEWAY_CLEARING', '#38bdf8', 'Asset / Receivable', 'Dine-debit ng kabuuang bayad ng mamimili kapag nakumpirma ng payment gateway webhook.'],
        ['SELLER_PAYABLE_PENDING', '#f59e0b', 'Liability / Pending Payout', 'Kine-credit ng netong kita ng nagbebenta hanggang matapos ang kaganapan nang walang alitan.'],
        ['PLATFORM_FEE_REVENUE', '#F3EBDD', 'Kita', 'Kine-credit ng Dual-Tier V2 fee (6% max IDR 300k/tiket o 9% max IDR 450k/tiket; min IDR 35,000).'],
        ['PROVIDER_FEE_EXPENSE', '#cbd5e1', 'Gastos / Clearing', 'Kine-credit ng bayarin sa pagproseso ng payment gateway (IDR 5,000).'],
        ['SETTLEMENT_CLEARING', '#a855f7', 'Clearing / Disbursal', 'Kine-credit kapag ipinadala na ang payout sa bank account ng nagbebenta.']
      ],
      releaseTitle: 'Mga Kundisyon at Takdang Panahon ng Paglabas',
      releaseItems: [
        '<strong>Paglabas ng Pondo:</strong> Ipinapadala lamang sa nagbebenta matapos ang kaganapan at 24-oras na dispute window.',
        '<strong>Bilis ng Transfer:</strong> Sa loob ng 1 araw ng negosyo matapos ang beripikasyon.'
      ],
      refundTitle: 'Daloy ng Refund at Dispute SLA',
      refundLead: 'Kapag nakansela ang order o naaprubahan ang alitan, ibinabalik ng <code style="color:#f43f5e;">FinancialLedger.recordRefund()</code> ang buong pondo sa loob ng 1-3 araw ng negosyo.',
      refundItems: [
        '<strong>Oras ng Pag-uulat:</strong> Sa loob ng 60 minuto ng pagbubukas ng gate o hanggang 24 oras pagkatapos ng kaganapan.',
        '<strong>Pagsusuri ng Ebidensya:</strong> 24 hanggang 48 oras ng Trust Officer.',
        '<strong>Pagproseso ng Refund:</strong> Sa loob ng 1 araw ng negosyo matapos ang pag-apruba.'
      ],
      regTitle: 'Paunawa sa Pagsunod sa Regulasyon',
      regBody: 'Ang pagproseso ng bayad ay pinapadali sa pamamagitan ng mga lisensyadong payment gateway partner alinsunod sa mga regulasyon ng Bank Indonesia.',
      faqs: [
        { q: 'Nakatago ba ang pera ko sa bank escrow account?', a: 'Hindi. Pinamamahalaan ang pondo sa panloob na accounting ledger ng platform at inilalabas lamang matapos ang matagumpay na pagpasok.' },
        { q: 'Gaano katagal ang refund kung may problema sa tiket?', a: 'Ibinabalik sa orihinal na paraan ng pagbabayad sa loob ng 1 hanggang 3 araw ng negosyo matapos maberipika.' }
      ]
    },
    th: {
      title: 'เส้นทางเงินและสถาปัตยกรรมบัญชีของแพลตฟอร์ม | Tikum',
      description: 'เอกสารแสดงเส้นทางเงินในระบบบัญชีคู่ของ TIKUM: การรับชำระเงิน การพักยอด การโอนให้ผู้ขาย และระยะเวลาการคืนเงิน',
      h1: 'เส้นทางเงินและการกำกับดูแลบัญชีแพลตฟอร์ม',
      subtitle: 'การเคลื่อนย้ายเงินที่โปร่งใสภายใต้ระบบควบคุมบัญชีคู่โดยไม่อ้างสิทธิ์บัญชีเอสโครว์ธนาคาร',
      breadcrumb: 'เส้นทางเงิน',
      badge: 'การควบคุมทางบัญชีของแพลตฟอร์ม',
      archTitle: 'สถาปัตยกรรมเส้นทางเงินที่โปร่งใส',
      archBody: 'TIKUM ใช้ระบบ<strong>บัญชีคู่ภายในแพลตฟอร์ม</strong> (<code style="color:#38bdf8;">FinancialLedger</code>) เมื่อผู้ซื้อชำระเงิน ยอดจะเข้าสู่ยอดหักบัญชีเกตเวย์และบันทึกในระบบควบคุมของแพลตฟอร์ม',
      nonBankTitle: 'คำชี้แจงเรื่องการเก็บรักษาเงินที่ไม่ใช่บัญชีธนาคาร:',
      nonBankBody: 'เงินที่พักไว้ภายใต้ระบบควบคุมของแพลตฟอร์ม<strong>ไม่ได้เก็บรักษาในบัญชีเอสโครว์ของธนาคารบุคคลที่สาม</strong> TIKUM ไม่ใช่สถาบันธนาคาร การคุ้มครองทั้งหมดดำเนินการผ่านระบบบัญชีปิดที่ตรวจสอบสมดุลอย่างเข้มงวด',
      ledgerTitle: 'ผังบัญชีคู่ (Double-Entry Journal Accounts)',
      ledgerLead: 'ทุกธุรกรรมต้องเป็นไปตามสมการสมดุลทางบัญชี: <code style="color:#10b981;">ยอดเดบิต === ยอดเครดิต</code>',
      ledgerCols: ['รหัสบัญชี', 'หมวดหมู่บัญชี', 'บทบาทในเส้นทางเงิน'],
      ledgerRows: [
        ['PAYMENT_GATEWAY_CLEARING', '#38bdf8', 'สินทรัพย์ / ลูกหนี้หักบัญชี', 'บันทึกเดบิตตามยอดชำระรวมเมื่อเกตเวย์ยืนยันการชำระเงินผ่าน Webhook'],
        ['SELLER_PAYABLE_PENDING', '#f59e0b', 'หนี้สิน / ยอดรอจ่ายผู้ขาย', 'บันทึกเครดิตยอดรับสุทธิของผู้ขาย และล็อกไว้จนจบงานโดยไม่มีข้อพิพาท'],
        ['PLATFORM_FEE_REVENUE', '#F3EBDD', 'รายได้ค่าบริการ', 'บันทึกเครดิตค่าบริการ Dual-Tier V2 (6% สูงสุด IDR 300k/ใบ หรือ 9% สูงสุด IDR 450k/ใบ; ขั้นต่ำ IDR 35,000)'],
        ['PROVIDER_FEE_EXPENSE', '#cbd5e1', 'ค่าใช้จ่ายเกตเวย์', 'บันทึกเครดิตค่าธรรมเนียมเกตเวย์ชำระเงิน (IDR 5,000 ต่อธุรกรรม)'],
        ['SETTLEMENT_CLEARING', '#a855f7', 'บัญชีหักล้างการโอนจ่าย', 'บันทึกเครดิตเมื่อโอนเงินเข้าบัญชีธนาคารของผู้ขายหลังจบงาน']
      ],
      releaseTitle: 'เงื่อนไขและกำหนดเวลาการโอนเงินให้ผู้ขาย',
      releaseItems: [
        '<strong>เงื่อนไขการโอนออก:</strong> เงินจะโอนให้ผู้ขายหลังจากงานอีเวนต์เสร็จสิ้นและพ้นช่วงตรวจสอบข้อพิพาท 24 ชั่วโมงโดยไม่มีคำร้องเรียน',
        '<strong>ระยะเวลาโอนเงิน:</strong> ยอดที่อนุมัติแล้วจะโอนเข้าบัญชีธนาคารของผู้ขายภายใน 1 วันทำการธนาคารหลังการตรวจสอบ'
      ],
      refundTitle: 'เส้นทางการคืนเงินและระยะเวลาดำเนินการ (SLA)',
      refundLead: 'หากคำสั่งซื้อถูกยกเลิกหรือข้อพิพาทได้รับการอนุมัติ ฟังก์ชัน <code style="color:#f43f5e;">FinancialLedger.recordRefund()</code> จะกลับรายการบัญชีอัตโนมัติและคืนเงินเต็มจำนวนผ่านช่องทางเดิมภายใน 1-3 วันทำการ',
      refundItems: [
        '<strong>ระยะเวลาแจ้งข้อพิพาท:</strong> ภายใน 60 นาทีหลังประตูเปิด หรือไม่เกิน 24 ชั่วโมงหลังจบงาน',
        '<strong>ระยะเวลาตรวจสอบหลักฐาน:</strong> 24 ถึง 48 ชั่วโมงโดยเจ้าหน้าที่ Trust Officer',
        '<strong>การดำเนินการคืนเงิน:</strong> ภายใน 1 วันทำการหลังจากอนุมัติคำตัดสิน'
      ],
      regTitle: 'หมายเหตุการปฏิบัติตามกฎระเบียบ',
      regBody: 'การรับชำระเงินดำเนินการผ่านพันธมิตร Payment Gateway ที่ได้รับอนุญาตตามกฎระเบียบของธนาคารกลางอินโดนีเซีย (Bank Indonesia)',
      faqs: [
        { q: 'เงินของฉันถูกเก็บไว้ในบัญชีเอสโครว์ของธนาคารหรือไม่?', a: 'ไม่ใช่ เงินถูกบันทึกและควบคุมในระบบบัญชีคู่ภายในแพลตฟอร์มและจะโอนให้ผู้ขายเมื่อการเข้างานสำเร็จเท่านั้น' },
        { q: 'ใช้เวลานานเท่าใดในการคืนเงินหากบัตรมีปัญหา?', a: 'หลังจากตรวจสอบหลักฐานแล้ว เงินจะถูกคืนเข้าช่องทางชำระเงินเดิมภายใน 1 ถึง 3 วันทำการ' }
      ]
    }
  }
};

function getTrustCopy(section, lang) {
  return pickLocale(TRUST_PAGES_CONTENT[section], lang);
}

module.exports = {
  TRUST_PAGES_CONTENT,
  getTrustCopy
};

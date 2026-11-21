async function verifyProd() {
  console.log('── Live Production Verification on https://tikum.app ──');

  // 1. Check MCR SVG Poster
  const posterRes = await fetch('https://tikum.app/api/events/my-chemical-romance-jakarta-2026/poster.svg');
  console.log('1. MCR Poster status:', posterRes.status, posterRes.headers.get('content-type'));
  const posterBody = await posterRes.text();
  console.log('   SVG contains My Chemical Romance:', posterBody.includes('My Chemical Romance'));
  console.log('   SVG contains JIS venue:', posterBody.includes('Jakarta International Stadium'));
  console.log('   SVG contains 3:4 viewBox:', posterBody.includes('viewBox="0 0 600 800"'));

  // 2. Check Homepage HTML
  const homeRes = await fetch('https://tikum.app/');
  console.log('2. Homepage status:', homeRes.status);
  const homeHtml = await homeRes.text();
  console.log('   Homepage has card-mcr with img:', homeHtml.includes('id="card-mcr"') && homeHtml.includes('/api/events/my-chemical-romance-jakarta-2026/poster.svg'));
  console.log('   Homepage skull icon removed from poster-wrap:', !homeHtml.includes('fa-skull'));
  console.log('   Homepage card-mcr has 3:4 height=720:', homeHtml.includes('height="720"'));

  // 3. Check CSS
  const cssRes = await fetch('https://tikum.app/css/style.css');
  const cssBody = await cssRes.text();
  console.log('3. CSS poster-media has aspect-ratio 3 / 4:', cssBody.includes('aspect-ratio: 3 / 4;'));
  console.log('   CSS hero-spotlight poster-img has object-fit contain:', cssBody.includes('object-fit: contain;'));
  console.log('   CSS mobile media query (max-width: 480px) present:', cssBody.includes('@media (max-width: 480px)'));
  console.log('   CSS mobile grid single column 1fr present:', cssBody.includes('grid-template-columns: 1fr;'));

  // 4. Check Home Feed API
  const feedRes = await fetch('https://tikum.app/api/events/home-feed');
  const feedData = await feedRes.json();
  console.log('4. Home Feed status:', feedRes.status, 'success:', feedData.success);
  console.log('   Hero concerts count:', (feedData.sections?.hero_concerts || []).length);
  console.log('   Top hero slugs:', (feedData.sections?.hero_concerts || []).map(h => h.slug));

  // 5. Check Payment Gateway Frozen
  const payRes = await fetch('https://tikum.app/api/payments/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing_id: 'test', amount: 100000 })
  });
  const payData = await payRes.json().catch(() => ({}));
  console.log('5. Payment Pay status:', payRes.status, payData.code || payData.error);
}

verifyProd().catch(console.error);

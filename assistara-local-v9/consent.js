/* Assistara Cookie Consent — minimal, premium, brand-consistent.
 *
 * Manages the 'assistara_ads_consent' cookie (values: 'accept' | 'reject').
 * Controls loading of non-essential advertising pixels (Reddit, etc.).
 * Google Ads base tag loads regardless (legitimate interest for fraud prevention).
 * Google Ads conversion events still require explicit consent in their handlers.
 *
 * Banner appears on first visit. Preference persists for 365 days.
 * Users can reopen preferences via the "Cookie Preferences" link in the footer.
 */
(function(){
  const COOKIE_NAME = 'assistara_ads_consent';
  const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
  const BANNER_ID = 'assistaraCookieBanner';
  const LINK_ID = 'assistaraCookieLink';

  function getConsent(){
    try{
      return document.cookie.split('; ').find(c => c.startsWith(COOKIE_NAME + '='))?.split('=')[1] || null;
    }catch(e){return null}
  }
  function setConsent(value){
    document.cookie = `${COOKIE_NAME}=${value};max-age=${COOKIE_MAX_AGE};path=/;SameSite=Lax${location.protocol==='https:'?';Secure':''}`;
  }
  function hasConsented(){
    return getConsent() === 'accept';
  }
  function removeBanner(){
    const b = document.getElementById(BANNER_ID);
    if(b) b.remove();
  }
  function showBanner(){
    if(document.getElementById(BANNER_ID)) return;
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role','dialog');
    banner.setAttribute('aria-label','Cookie consent');
    banner.style.cssText = `
      position:fixed;left:0;right:0;bottom:0;z-index:9999;
      background:#171717;color:#fff;font-family:"Manrope",sans-serif;
      box-shadow:0 -4px 24px rgba(0,0,0,.15);
      padding:16px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;
      justify-content:space-between;
    `;
    banner.innerHTML = `
      <p style="margin:0;font-size:14px;line-height:1.5;max-width:600px;flex:1 1 280px;">
        We use cookies to measure advertising performance (Reddit Ads) and improve your experience.
        <a href="/privacy" style="color:#ffd51f;text-decoration:underline;">Privacy Policy</a>
      </p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button id="${BANNER_ID}Accept" style="background:#ffd51f;color:#171717;border:0;border-radius:999px;padding:10px 20px;font:800 14px/1 'Manrope',sans-serif;cursor:pointer;">Accept</button>
        <button id="${BANNER_ID}Reject" style="background:transparent;color:#fff;border:1px solid #fff;border-radius:999px;padding:10px 20px;font:800 14px/1 'Manrope',sans-serif;cursor:pointer;">Reject</button>
      </div>
    `;
    document.body.appendChild(banner);
    document.getElementById(`${BANNER_ID}Accept`).addEventListener('click',()=>{setConsent('accept');removeBanner();window.dispatchEvent(new Event('assistaraConsentChange'))});
    document.getElementById(`${BANNER_ID}Reject`).addEventListener('click',()=>{setConsent('reject');removeBanner();window.dispatchEvent(new Event('assistaraConsentChange'))});
  }
  function init(){
    const existing = getConsent();
    if(!existing){
      // Show after a short delay to not block LCP
      setTimeout(showBanner, 800);
    }
    // Expose API for other scripts
    window.AssistaraConsent = {
      get: getConsent,
      hasConsented: hasConsented,
      accept: () => {setConsent('accept');removeBanner();window.dispatchEvent(new Event('assistaraConsentChange'))},
      reject: () => {setConsent('reject');removeBanner();window.dispatchEvent(new Event('assistaraConsentChange'))},
      reset: () => {document.cookie = `${COOKIE_NAME}=;max-age=0;path=/`;window.dispatchEvent(new Event('assistaraConsentChange'))}
    };
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
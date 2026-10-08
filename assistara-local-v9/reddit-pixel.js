/* Reddit Ads Pixel for Assistara (a2_jte0nyi9n43d).
 *
 * Single source of truth. It is included exactly once from the <head> of every
 * public Assistara page via <script src="/reddit-pixel.js"></script>.
 *
 * Do NOT paste the rdt snippet into individual HTML pages. Keeping it in one
 * file means the Pixel ID is changed in exactly one place and the bootstrap
 * runs once per page load. The snippet is idempotent (it bails out if window.rdt
 * already exists), so an accidental double include cannot initialise the Pixel
 * twice.
 *
 * This site has no client-side router: every navigation is a full document
 * load, so no re-render can re-run this file twice in one document.
 *
 * Base Pixel only. The Lead conversion event is fired from academy.html at the
 * exact point where a masterclass registration has been confirmed by the
 * backend - never from here, so a page load can never register a conversion.
 *
 * Advanced matching: when consent is granted, email is passed to Reddit.
 * Reddit hashes the email client-side before transmission.
 * Conversion deduplication: each Lead event includes a stable conversionId
 * derived from the backend-issued attendeeToken.
 */
!function(w,d){
  if(w.rdt)return;
  var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};
  p.callQueue=[];
  var t=d.createElement("script");
  t.src="https://www.redditstatic.com/ads/pixel.js?pixel_id=a2_jte0nyi9n43d";
  t.async=!0;
  var s=d.getElementsByTagName("script")[0];
  s.parentNode.insertBefore(t,s);
}(window,document);
rdt('init','a2_jte0nyi9n43d');
rdt('track','PageVisit');

/* Consent-aware Reddit tracking helpers.
 * These are attached to window.AssistaraReddit for use by page handlers.
 * All tracking is gated behind the AssistaraConsent API (assistara_ads_consent cookie).
 * When consent is absent or declined, only anonymised PageVisit fires.
 */
(function(){
  function hasConsent(){
    try{return window.AssistaraConsent?.hasConsented?.() ?? false}catch(e){return false}
  }
  window.AssistaraReddit={
    hasConsent:hasConsent,
    trackLead:function(attendeeToken, email){
      if(!attendeeToken)return;
      var opts={conversionId: attendeeToken};
      if(hasConsent() && email){
        opts.email=email;
      }
      try{
        if(typeof window.rdt==='function'){
          window.rdt('track','Lead',opts);
        }
      }catch(e){
        console.debug('Reddit Lead event failed:',e);
      }
    }
  };
})();
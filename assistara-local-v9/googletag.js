/* Google Ads base tag for Assistara (AW-341289722).
 *
 * Single source of truth. It is included exactly once from the <head> of every
 * public Assistara page via <script src="/googletag.js"></script>.
 *
 * Do NOT paste the gtag snippet into individual HTML pages. Keeping it in one
 * file means the Google Ads ID is changed in exactly one place and the bootstrap
 * runs once per page load. The snippet is idempotent (it bails out if the loader
 * was already initialised), so an accidental double include cannot initialise the
 * tag twice.
 *
 * This site has no client-side router: every navigation is a full document
 * load, so no re-render can re-run this file twice in one document.
 *
 * Base tag only. No conversion events are fired from this file. The Masterclass
 * Lead Form conversion is fired from academy.html at the exact point where a
 * signup has been confirmed by the backend - never from here, so a page load
 * can never register a conversion.
 */
!function(w,d,s,u,id){
  if(w._assistaraGoogleAds)return;
  w._assistaraGoogleAds=true;
  w.dataLayer=w.dataLayer||[];
  function gtag(){w.dataLayer.push(arguments);}
  w.gtag=gtag;
  gtag("js",new Date());
  gtag("config",id);
  if(!d.getElementById("assistara-google-ads-js")){
    var j=d.createElement(s);
    j.id="assistara-google-ads-js";
    j.async=1;
    j.src=u+"?id="+id;
    var f=d.getElementsByTagName(s)[0];
    f.parentNode.insertBefore(j,f);
  }
}(window,document,"script","https://www.googletagmanager.com/gtag/js","AW-341289722");
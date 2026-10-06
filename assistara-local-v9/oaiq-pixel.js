/* OpenAI Ads base pixel for Assistara.
 *
 * Single source of truth. It is included exactly once from the <head> of every
 * public Assistara page via <script src="/oaiq-pixel.js"></script>.
 *
 * Do NOT paste this snippet into individual HTML pages. Keeping it in one file
 * means the pixel ID is changed in exactly one place and the bootstrap runs
 * once per page load. The snippet is idempotent (it bails out if window.oaiq
 * already exists), so an accidental double include cannot initialise the pixel
 * twice.
 *
 * This site has no client-side router: every navigation is a full document
 * load, so no re-render can re-run this file twice in one document.
 *
 * Base pixel only. No conversion events are fired from this file yet.
 */
!function(w,d,s,u){if(w.oaiq)return;var q=function(){q.q.push(arguments)};q.q=[];w.oaiq=q;var j=d.createElement(s);j.async=1;j.src=u;var f=d.getElementsByTagName(s)[0];f.parentNode.insertBefore(j,f)}(window,document,"script","https://bzrcdn.openai.com/sdk/oaiq.min.js");oaiq("init",{pixelId:"WsV6YTxDxKer2SEn7KPXGp",debug:true});

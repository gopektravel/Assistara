const fs = require('fs');

const content = fs.readFileSync('supabase/functions/_shared/email-delivery.ts', 'utf8');

const fixed = content
  .replace(
    /const toResendAttachments = \(atts: EmailAttachment\[\]\) => atts\.map\(a => \(\{[\s\S]*?\}\)/g,
    `const toResendAttachments = (atts: EmailAttachment[]) => {
      return atts.map(a => {
        return {
          filename: a.filename,
          content: a.content instanceof Uint8Array ? b64(a.content) : String(a.content),
          contentType: a.contentType || guessContentType(a.filename),
          disposition: a.disposition || 'attachment',
          contentId: a.contentId,
        };
      });
    };`
  )
  .replace(
    /const toBrevoAttachments = \(atts: EmailAttachment\[\]\) => atts\.map\(a => \(\{[\s\S]*?\}\)/g,
    `const toBrevoAttachments = (atts: EmailAttachment[]) => {
      return atts.map(a => {
        return {
          name: a.filename,
          content: a.content instanceof Uint8Array ? b64(a.content) : String(a.content),
          contentType: a.contentType || guessContentType(a.filename),
          disposition: a.disposition || 'attachment',
        };
      });
    };`
  );

fs.writeFileSync('supabase/functions/_shared/email-delivery.ts', fixed);
console.log('Fixed');
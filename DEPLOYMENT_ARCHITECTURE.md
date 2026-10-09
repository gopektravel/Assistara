# Assistara Masterclass — Deployment Architecture

## Overview

The masterclass presentation (`masterclass.getassistara.com`) is deployed as a **separate Vercel project** from the main Assistara website, ensuring complete isolation while sharing the same GitHub repository.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ GitHub Repository: gopektravel/Assistara                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────┐    ┌──────────────────────────────────┐  │
│  │  Main Website Project   │    │  Masterclass Presentation Project │  │
│  │  (assistara)            │    │  (assistara-masterclass)          │  │
│  ├─────────────────────────┤    ├──────────────────────────────────┤  │
│  │ Root Dir: assistara-    │    │ Root Dir: assistara-local-v9/    │  │
│  │ local-v9                │    │ masterclass-presentation         │  │
│  ├─────────────────────────┤    ├──────────────────────────────────┤  │
│  │ Domain: getassistara.com│    │ Domain: masterclass.getassistara.com│
│  │                         │    │                                   │  │
│  │ Vercel Project:         │    │ Vercel Project:                  │  │
│  │ prj_IvuoCJ8hpqSgWz0p   │    │ (NEW PROJECT)                    │  │
│  │ bnP9NHeR6Dox            │    │                                   │  │
│  └─────────────────────────┘    └──────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Repository Structure

```
Assistara/ (repo root)
├── .github/
│   └── workflows/
│       ├── deploy-main.yml          # Main website deployment
│       └── deploy-masterclass.yml   # Masterclass deployment
├── assistara-local-v9/              # Main website (rootDir for main project)
│   ├── vercel.json                  # Main site Vercel config
│   ├── index.html
│   ├── api/
│   ├── masterclass-presentation/    # Masterclass presentation (NEW)
│   │   ├── index.html               # Reveal.js entry point
│   │   ├── vercel.json              # Masterclass Vercel config
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── css/
│   │   ├── js/
│   │   ├── public/
│   │   ├── .github/
│   │   │   └── workflows/
│   │   │       └── deploy.yml       # Masterclass-only deploy
│   │   └── dist/                    # Build output (gitignored)
│   └── ... (other main site files)
└── supabase/                        # Supabase functions (shared)
```

## Vercel Configuration

### Masterclass Presentation Project (`assistara-masterclass`)

**Project Settings:**
- **Project Name**: `assistara-masterclass`
- **Framework**: `vite` (or "Other" for static)
- **Root Directory**: `assistara-local-v9/masterclass-presentation`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm ci`
- **Node Version**: `24.x`

**Environment Variables:**
```
VERCEL_PROJECT_ID=prj_xxxxxxxxxxxxxxxx
VERCEL_ORG_ID=team_ABWJnvuNNJise1leYQgAe8yU
```

### Main Website Project (unchanged)

**Project Settings:** (existing)
- **Root Directory**: `assistara-local-v9`
- **Domain**: `getassistara.com`

## DNS Configuration

### Required DNS Records

| Type | Name | Value | TTL | Purpose |
|------|------|-------|-----|---------|
| CNAME | `masterclass` | `cname.vercel-dns.com` | 3600 | Points to Vercel |
| TXT | `_vercel.masterclass` | `vc-verification=...` | 3600 | Domain verification |

### Vercel Domain Setup

1. In Vercel dashboard for `assistara-masterclass` project:
   - Settings → Domains → Add `masterclass.getassistara.com`
   - Vercel provides verification TXT record
   - Add TXT record to DNS
   - Vercel provisions SSL automatically

## Access Protection (Authorization)

### Option 1: Vercel Password Protection (Simplest)
- Project Settings → Password Protection → Enable
- Set a shared password for the presentation
- Distribute password to authorized attendees only

### Option 2: Vercel Authentication (Vercel Auth)
- Enable "Vercel Authentication" in project settings
- Configure allowed email domains (`@gopektravel.com`, `@assistara.com`)
- Users authenticate via Vercel before accessing

### Option 3: Custom Middleware (Most Flexible)
Create `middleware.ts` in presentation root:
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Allow public access to landing page only
  if (request.nextUrl.pathname === '/') {
    return NextResponse.next();
  }
  
  // Check for valid session/token
  const token = request.cookies.get('masterclass_auth')?.value;
  if (!token || !isValidToken(token)) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

### Recommended: Option 1 (Password Protection) for MVP
- Zero code changes required
- Instant to enable/disable
- Sufficient for live event access control
- Can be enhanced later

## Deployment Workflows

### Main Website Deployment (`.github/workflows/deploy-main.yml`)
```yaml
name: Deploy Main Website
on:
  push:
    branches: [main]
    paths:
      - 'assistara-local-v9/**'
      - '!assistara-local-v9/masterclass-presentation/**'
      - 'supabase/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_MAIN }}
          vercel-args: '--prod'
        env:
          VERCEL_ROOT_DIRECTORY: assistara-local-v9
```

### Masterclass Deployment (`.github/workflows/deploy-masterclass.yml`)
```yaml
name: Deploy Masterclass Presentation
on:
  push:
    branches: [main]
    paths:
      - 'assistara-local-v9/masterclass-presentation/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: assistara-local-v9/masterclass-presentation
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_MASTERCLASS }}
          vercel-args: '--prod'
        env:
          VERCEL_ROOT_DIRECTORY: assistara-local-v9/masterclass-presentation
```

## Independent Deployment Guarantee

### Path-Based Trigger Isolation
- **Main site deploys** when: `assistara-local-v9/**` changes (EXCEPT `masterclass-presentation/**`)
- **Masterclass deploys** when: `assistara-local-v9/masterclass-presentation/**` changes
- **Both deploy** when: `supabase/**` changes (shared functions)

### Vercel Project Isolation
- Separate Vercel projects = separate build caches, logs, domains
- No shared build cache = no cross-contamination
- Separate environment variables per project

## Security Checklist

- [ ] Main website Vercel project unchanged
- [ ] Masterclass project has separate Vercel project ID
- [ ] Main website domain (`getassistara.com`) unaffected
- [ ] Masterclass domain (`masterclass.getassistara.com`) configured
- [ ] Password protection enabled on masterclass project
- [ ] No shared build artifacts between projects
- [ ] Separate Vercel project IDs in GitHub secrets
- [ ] GitHub workflows use correct root directories
- [ ] DNS CNAME for `masterclass.getassistara.com` added
- [ ] SSL certificate auto-provisioned by Vercel

## Deployment Commands

### Local Development
```bash
# Main website
cd assistara-local-v9 && npm run dev

# Masterclass presentation
cd assistara-local-v9/masterclass-presentation && npm run dev
```

### Production Build (Local Test)
```bash
# Main site
cd assistara-local-v9 && npm run build

# Masterclass
cd assistara-local-v9/masterclass-presentation && npm run build
```

### Manual Vercel Deploy (if needed)
```bash
# Main site
cd assistara-local-v9 && npx vercel --prod

# Masterclass
cd assistara-local-v9/masterclass-presentation && npx vercel --prod
```

## Rollback Procedure

### Main Website
```bash
# Via Vercel CLI
npx vercel rollback <deployment-url> --token=$VERCEL_TOKEN

# Or via Vercel Dashboard: Deployments → ... → Promote to Production
```

### Masterclass
```bash
cd assistara-local-v9/masterclass-presentation
npx vercel rollback <deployment-url> --token=$VERCEL_TOKEN
```

## Monitoring & Logs

### Vercel Dashboard
- Main project: `https://vercel.com/team_ABWJnvuNNJise1leYQgAe8yU/assistara`
- Masterclass project: `https://vercel.com/team_ABWJnvuNNJise1leYQgAe8yU/assistara-masterclass`

### Real-time Logs
```bash
# Main
npx vercel logs <deployment-url> --token=$VERCEL_TOKEN

# Masterclass
npx vercel logs <deployment-url> --token=$VERCEL_TOKEN --scope=assistara-masterclass
```

## Emergency Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| DevOps Lead | [Name] | Vercel/Deploy issues |
| DNS Admin | [Name] | DNS/SSL issues |
| Security Lead | [Name] | Access/auth issues |

---

## Next Steps (Pending Approval)

1. **Create Vercel project** for `assistara-masterclass`
2. **Add GitHub secrets** for masterclass project IDs
3. **Add DNS records** for `masterclass.getassistara.com`
4. **Enable password protection** on masterclass project
5. **Test deployment** via GitHub Actions
6. **Verify SSL** and access protection
7. **Update documentation** with live URLs

---

**Status**: Architecture designed, configuration files ready. **Awaiting approval to proceed with Vercel project creation and DNS setup.**
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface NotifyItem {
  category: string;
  productName: string;
  modelOrSize: string;
  quantity: number;
  notes?: string;
}

interface NotifyPayload {
  enquiryId: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  city: string;
  country: string;
  message?: string;
  items: NotifyItem[];
}

function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.COMPANY_NOTIFICATION_EMAIL
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Serve static files from public directory directly (images, assets, videos)
  app.use(express.static(path.resolve(__dirname, 'public')));

  const CMS_DIR = path.resolve(__dirname, 'data', 'cms');
  if (!fs.existsSync(CMS_DIR)) {
    fs.mkdirSync(CMS_DIR, { recursive: true });
  }

  const MEDIA_FILE = path.join(CMS_DIR, 'media-assets.json');
  const PRODUCTS_FILE = path.join(CMS_DIR, 'products.json');
  const SITE_CONTENT_FILE = path.join(CMS_DIR, 'site-content.json');
  const SETTINGS_FILE = path.join(CMS_DIR, 'settings.json');

  const readJson = <T>(filePath: string, fallback: T): T => {
    try {
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(text);
      }
    } catch {
      // return fallback
    }
    return fallback;
  };

  const writeJson = (filePath: string, data: any): void => {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to write JSON to', filePath, e);
    }
  };

  app.use(express.json({ limit: '25mb' }));

  // Media Assets Endpoints (Persists uploaded images across all browsers)
  app.get('/api/media', (_req, res) => {
    const map = readJson<Record<string, any>>(MEDIA_FILE, {});
    res.json({ ok: true, assets: Object.values(map) });
  });

  app.post('/api/media', (req, res) => {
    const asset = req.body?.asset || req.body;
    if (!asset || !asset.id) {
      res.status(400).json({ ok: false, error: 'Invalid asset payload' });
      return;
    }
    const map = readJson<Record<string, any>>(MEDIA_FILE, {});
    // Never replace an existing static /media/ path with an obsolete base64 dataUrl
    if (map[asset.id]?.dataUrl && !map[asset.id].dataUrl.startsWith('data:') && asset.dataUrl?.startsWith('data:')) {
      res.json({ ok: true, asset: map[asset.id] });
      return;
    }
    map[asset.id] = asset;
    writeJson(MEDIA_FILE, map);
    res.json({ ok: true, asset });
  });

  // Custom / Live Products Endpoints
  app.get('/api/products', (_req, res) => {
    const map = readJson<Record<string, any>>(PRODUCTS_FILE, {});
    res.json({ ok: true, products: Object.values(map) });
  });

  app.post('/api/products', (req, res) => {
    const product = req.body?.product || req.body;
    if (!product || !product.id) {
      res.status(400).json({ ok: false, error: 'Invalid product payload' });
      return;
    }
    const map = readJson<Record<string, any>>(PRODUCTS_FILE, {});
    map[product.id] = product;
    writeJson(PRODUCTS_FILE, map);
    res.json({ ok: true, product });
  });

  // Site Content Endpoints
  app.get('/api/site-content', (_req, res) => {
    const data = readJson<{ published: any; draft: any }>(SITE_CONTENT_FILE, {
      published: null,
      draft: null,
    });
    res.json({ ok: true, ...data });
  });

  app.post('/api/site-content', (req, res) => {
    const { content, mode } = req.body || {};
    if (!content) {
      res.status(400).json({ ok: false, error: 'Missing content payload' });
      return;
    }
    const existing = readJson<{ published: any; draft: any }>(SITE_CONTENT_FILE, {
      published: null,
      draft: null,
    });
    if (mode === 'draft' || mode === 'preview') {
      existing.draft = content;
    } else {
      existing.published = content;
      existing.draft = content;
    }
    writeJson(SITE_CONTENT_FILE, existing);
    res.json({ ok: true });
  });

  // Settings Endpoints
  app.get('/api/settings', (_req, res) => {
    const settings = readJson(SETTINGS_FILE, null);
    res.json({ ok: true, settings });
  });

  app.post('/api/settings', (req, res) => {
    const settings = req.body?.settings || req.body;
    if (!settings) {
      res.status(400).json({ ok: false, error: 'Missing settings payload' });
      return;
    }
    writeJson(SETTINGS_FILE, settings);
    res.json({ ok: true, settings });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'SHREE DURGA STEELS' });
  });

  app.get('/api/email-config-status', (_req, res) => {
    res.json({
      configured: isSmtpConfigured(),
      recipientConfigured: Boolean(process.env.COMPANY_NOTIFICATION_EMAIL),
    });
  });

  app.post('/api/enquiries/notify', async (req, res) => {
    const body = req.body as Partial<NotifyPayload>;
    if (
      !body ||
      typeof body.enquiryId !== 'string' ||
      typeof body.name !== 'string' ||
      typeof body.companyName !== 'string' ||
      typeof body.email !== 'string' ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    ) {
      res.status(400).json({ ok: false, error: 'Invalid enquiry notification payload.' });
      return;
    }

    if (!isSmtpConfigured()) {
      res.json({
        ok: true,
        emailed: false,
        configured: false,
        message: 'Enquiry stored securely. Email notification is awaiting SMTP configuration.',
      });
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const itemsHtml = body.items
        .map(
          (item) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;">${escapeHtml(item.category)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;">${escapeHtml(item.productName)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;">${escapeHtml(item.modelOrSize)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;">${Number(item.quantity)}</td>
          </tr>`
        )
        .join('');

      await transporter.sendMail({
        from: `"SHREE DURGA STEELS Website" <${process.env.SMTP_USER}>`,
        to: process.env.COMPANY_NOTIFICATION_EMAIL,
        replyTo: body.email,
        subject: `New Quotation Request (${body.enquiryId}) – ${body.companyName}`,
        html: `
          <div style="font-family:sans-serif;color:#292321;max-width:640px;margin:0 auto;">
            <h2 style="color:#000000;border-bottom:2px solid #5B1018;padding-bottom:8px;">
              New B2B Quotation Enquiry – SHREE DURGA STEELS
            </h2>
            <p><strong>Reference ID:</strong> ${escapeHtml(body.enquiryId)}</p>
            <p><strong>Contact Name:</strong> ${escapeHtml(body.name)}</p>
            <p><strong>Company:</strong> ${escapeHtml(body.companyName)}</p>
            <p><strong>Phone:</strong> ${escapeHtml(body.phone || '')}</p>
            <p><strong>Email:</strong> ${escapeHtml(body.email)}</p>
            <p><strong>Location:</strong> ${escapeHtml(body.city || '')}, ${escapeHtml(body.country || '')}</p>
            ${body.message ? `<p><strong>Additional Message:</strong><br/>${escapeHtml(body.message)}</p>` : ''}
            <h3 style="margin-top:20px;">Requested Products</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <thead>
                <tr style="background:#F5F5F5;text-align:left;">
                  <th style="padding:8px 12px;">Category</th>
                  <th style="padding:8px 12px;">Product</th>
                  <th style="padding:8px 12px;">Model / Size</th>
                  <th style="padding:8px 12px;">Quantity</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
          </div>
        `,
      });

      res.json({ ok: true, emailed: true, configured: true });
    } catch (error) {
      console.error('SMTP notification failed:', error);
      res.json({
        ok: true,
        emailed: false,
        configured: true,
        message: 'Enquiry stored in database, but email delivery failed.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SHREE DURGA STEELS server running on http://localhost:${PORT}`);
  });
}

startServer();

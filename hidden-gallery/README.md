# Hidden Gallery — deployment guide

## 1. Point the subdomain at your VPS (Spaceship DNS)

In Spaceship's DNS manager for `simchowitz.co`, add:

```
Type: A
Host: roadmap
Value: 159.89.2.237
TTL: default
```

That's it on the DNS side — no nameserver changes needed. Give it 10–30 min to propagate.

## 2. Get the files onto your VPS

From your own machine:

```bash
scp -r hidden-gallery root@159.89.2.237:/var/www/hidden-gallery
```

(or `git init` this folder, push to a private GitHub repo, and `git clone` it on the VPS instead — your call)

## 3. Install Node (if not already on the VPS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
node -v
```

## 4. Install dependencies and configure secrets

```bash
cd /var/www/hidden-gallery
npm install
cp .env.example .env
nano .env
```

Fill in `.env`:
- `JWT_SECRET` — generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `VISITOR_PASSPHRASE=HiddenGallery`
- `ADMIN_PASSPHRASE=` — pick something only you know, different from the visitor phrase

Add your cover photo:
```bash
# copy cover.jpg (included alongside this README) into public/
cp cover.jpg public/cover.jpg
```

## 5. Run it with pm2 (keeps it alive, restarts on crash/reboot)

```bash
sudo npm install -g pm2
pm2 start server.js --name hidden-gallery
pm2 save
pm2 startup   # follow the one printed command to enable on-boot start
```

## 6. Reverse proxy + SSL with nginx

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/roadmap.simchowitz.co`:

```nginx
server {
    listen 80;
    server_name roadmap.simchowitz.co;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/roadmap.simchowitz.co /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d roadmap.simchowitz.co
```

Certbot will get you a free SSL cert and auto-configure nginx to serve HTTPS
(needed anyway — the session cookie is `secure`, meaning it only works over HTTPS).

## 7. Using it

- **Visitors:** `https://roadmap.simchowitz.co` → enter `HiddenGallery` → cover → title card → article
- **You (editing):** `https://roadmap.simchowitz.co/admin` → enter your admin passphrase → format text, insert images, click **Save**

Saved content and uploaded images persist in `data/content.json` and `uploads/`
on the VPS itself — back those two up occasionally (`scp` them down, or add
them to a cron'd backup) since they're not in git.

## Notes

- If you ever want a real database instead of the JSON file (e.g. once the
  article gets long or you want revision history), the same server can be
  pointed at SQLite with minimal changes — flag it and I'll wire that in.
- `robots.txt` in this folder still blocks major crawlers at the edge; real
  access control is the server-side session check, not the file.

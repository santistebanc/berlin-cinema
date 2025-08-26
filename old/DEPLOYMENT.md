# 🚀 Berlin Cinema App Deployment Guide

## 📱 Frontend (GitHub Pages) ✅
- **Status**: Deployed and working
- **URL**: https://santistebanc.github.io/berlin-cinema/
- **Configuration**: ✅ Base path and routing configured

## 🔧 Backend API (Need to Deploy)

### Option 1: Railway (Recommended - Free)
1. **Sign up**: [railway.app](https://railway.app)
2. **Connect GitHub**: Link your repository
3. **Deploy API**: 
   - Select `berlin-cinema-api` folder
   - Railway will auto-detect Node.js
   - Use `npm start` as start command
4. **Get URL**: Railway will provide a URL like `https://your-app.railway.app`
5. **Update Environment**: Copy the URL to `berlin-cinema-app/env.production`

### Option 2: Render (Free)
1. **Sign up**: [render.com](https://render.com)
2. **New Web Service**: Connect your GitHub repo
3. **Configure**:
   - Build Command: `npm run build`
   - Start Command: `npm start`
4. **Deploy**: Render will build and deploy automatically

### Option 3: Heroku (Free tier discontinued)
- Not recommended due to no free tier

## 🔄 After Backend Deployment

1. **Update Production Environment**:
   ```bash
   # In berlin-cinema-app/env.production
   VITE_API_URL=https://your-actual-api-url.com/api
   ```

2. **Rebuild and Redeploy Frontend**:
   ```bash
   cd berlin-cinema-app
   npm run build
   git add . && git commit -m "Update API URL for production"
   git push origin main
   ```

## 🧪 Test Deployment

1. **Frontend**: https://santistebanc.github.io/berlin-cinema/
2. **API Health Check**: `https://your-api-url.com/api/health`
3. **Movies Endpoint**: `https://your-api-url.com/api/movies`

## 🚨 Current Issue

- **Frontend**: ✅ Working on GitHub Pages
- **Backend**: ❌ Still localhost:3001 (not accessible from deployed frontend)
- **Solution**: Deploy backend to Railway/Render and update environment variables

## 📋 Quick Deploy Commands

```bash
# Deploy to Railway (from berlin-cinema-api folder)
npx @railway/cli login
npx @railway/cli init
npx @railway/cli up

# Or use Railway dashboard (easier)
# 1. Go to railway.app
# 2. Connect GitHub repo
# 3. Select berlin-cinema-api folder
# 4. Deploy
```

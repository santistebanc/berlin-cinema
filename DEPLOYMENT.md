# Berlin Cinema - Dokploy Deployment Guide

## Prerequisites

1. **Server Requirements:**
   - Ubuntu 20.04+ or similar Linux distribution
   - At least 1GB RAM
   - Docker installed
   - Domain name (optional but recommended)

2. **Code Repository:**
   - Your code pushed to GitHub, GitLab, or similar Git repository

## Step 1: Install Dokploy

### On your server, run:

```bash
# Install Dokploy
curl -sSL https://dokploy.com/install.sh | sh

# Start Dokploy
sudo systemctl start dokploy
sudo systemctl enable dokploy
```

### Access Dokploy:
- Open your browser and go to `http://your-server-ip:3000`
- Create an admin account

## Step 2: Configure Your Project

### 2.1 Create New Project
1. In Dokploy dashboard, click "New Project"
2. Name: `berlin-cinema`
3. Description: `Berlin Cinema Movie App`

### 2.2 Connect Git Repository
1. Go to your project settings
2. Connect your Git repository:
   - Repository URL: `https://github.com/yourusername/berlin-cinema`
   - Branch: `main` (or your default branch)
   - Build Context: `/` (root directory)

### 2.3 Configure Build Settings
1. **Dockerfile Path:** `Dockerfile`
2. **Build Context:** `.` (current directory)
3. **Port:** `3003`

### 2.4 Environment Variables
Add these environment variables in Dokploy:
- `NODE_ENV=production`
- `PORT=3003`

## Step 3: Deploy

### 3.1 Manual Deployment
1. Click "Deploy" in your project dashboard
2. Dokploy will:
   - Clone your repository
   - Build the Docker image
   - Deploy the container

### 3.2 Automatic Deployment (Recommended)
1. Enable "Auto Deploy" in project settings
2. Push changes to your repository
3. Dokploy will automatically rebuild and deploy

## Step 4: Configure Domain (Optional)

### 4.1 Add Custom Domain
1. In your project settings, go to "Domains"
2. Add your domain: `cinema.yourdomain.com`
3. Configure DNS to point to your server IP

### 4.2 SSL Certificate
1. Dokploy can automatically generate SSL certificates
2. Enable "Auto SSL" in domain settings

## Step 5: Monitor Your Application

### 5.1 Health Checks
- Your app includes health checks that monitor the `/api/movies` endpoint
- Check the "Health" tab in Dokploy dashboard

### 5.2 Logs
- View real-time logs in the "Logs" tab
- Monitor for any errors or issues

### 5.3 Metrics
- Monitor CPU and memory usage
- Set up alerts if needed

## Troubleshooting

### Common Issues:

1. **Build Fails:**
   - Check Dockerfile syntax
   - Ensure all dependencies are in package.json
   - Verify Node.js version compatibility

2. **App Won't Start:**
   - Check logs for error messages
   - Verify environment variables
   - Ensure port 3003 is not blocked

3. **Health Check Fails:**
   - Verify your API endpoints are working
   - Check if the app is binding to the correct port
   - Review server.js configuration

### Useful Commands:

```bash
# Check container status
docker ps

# View container logs
docker logs berlin-cinema

# Access container shell
docker exec -it berlin-cinema sh
```

## Production Optimizations

### 1. Resource Limits
- Set appropriate memory limits (512MB recommended)
- Monitor CPU usage

### 2. Database (Future)
- Consider adding a database for data persistence
- Use environment variables for database connection

### 3. Caching
- Implement Redis for session storage
- Add CDN for static assets

### 4. Monitoring
- Set up application monitoring
- Configure alerts
- Regular health checks

## Security Considerations

1. **Environment Variables:**
   - Never commit sensitive data to Git
   - Use Dokploy's environment variable management

2. **Container Security:**
   - Your Dockerfile runs as non-root user
   - Regular security updates

3. **Network Security:**
   - Use HTTPS in production
   - Configure firewall rules

## Backup Strategy

1. **Code Backup:**
   - Your code is in Git repository
   - Regular pushes to remote repository

2. **Data Backup:**
   - If you add a database, set up regular backups
   - Consider using Dokploy's backup features

## Scaling

### Horizontal Scaling:
- Dokploy supports multiple container instances
- Configure load balancing
- Use Dokploy's scaling features

### Vertical Scaling:
- Increase server resources
- Optimize application performance

## Support

- Check Dokploy documentation: https://dokploy.com/docs
- Review application logs for debugging
- Monitor resource usage and performance

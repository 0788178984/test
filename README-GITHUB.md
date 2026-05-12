# GitHub Setup Instructions

## Project Information
- **Project Name**: Uganda Supermarket Management System
- **Author**: Ivan Lucky (asiimweivanlucky1@gmail.com)
- **Git Username**: 0788178984
- **Repository**: https://github.com/0788178984/SuperMKT.git

## Setup Steps

### 1. Install Git
1. Download Git from: https://git-scm.com/download/win
2. Install Git with default settings
3. Restart your computer after installation

### 2. Configure Git
```bash
git config --global user.name "0788178984"
git config --global user.email "asiimweivanlucky1@gmail.com"
```

### 3. Initialize Repository
```bash
cd C:\Users\SAFIQ\Desktop\uganda-supermarket
git init
git add .
git commit -m "Initial commit: Uganda Supermarket Management System"
```

### 4. Push to GitHub
```bash
git remote add origin https://github.com/0788178984/SuperMKT.git
git branch -M main
git push -u origin main
```

## Project Status
✅ **Client**: React application with Tailwind CSS
✅ **Server**: Node.js with Express and SQLite
✅ **Database**: SQLite with seeded users
✅ **Authentication**: Working login system
✅ **UI Components**: Complete component library

## Features
- 🏪 Point of Sale (POS) system
- 📦 Inventory management
- 👥 Customer management
- 📊 Sales reporting
- 👥 User management with role-based access
- 📱 Mobile money integration
- 📧 WhatsApp notifications
- 🔄 Offline-first architecture

## Default Credentials
- **Admin**: PIN 1234
- **Manager**: PIN 5678
- **Cashier**: PIN 9012

## Technologies Used
- **Frontend**: React, React Router, Tailwind CSS, Lucide React
- **Backend**: Node.js, Express, SQLite3, bcryptjs
- **Development**: Vite, nodemon
- **Deployment**: PWA ready

# Uganda Supermarket Management System

A comprehensive, offline-first supermarket management system tailored for Ugandan businesses with local SQLite, cloud PostgreSQL, and full PWA support.

## 🌟 Features

### Core Functionality
- **Point of Sale (POS)** with barcode scanner and mobile money integration
- **Inventory Management** with low stock alerts and expiry tracking
- **Customer Management** with loyalty points system
- **Supplier Management** with purchase order tracking
- **Sales Reporting** with real-time analytics
- **User Management** with role-based access control
- **Multi-channel Notifications** (SMS, WhatsApp, Email, In-app)
- **Offline-First Architecture** with automatic sync
- **PWA Support** for mobile and desktop use
- **Electron Desktop App** wrapper

### Uganda-Specific Features
- **MTN Mobile Money** integration
- **Airtel Money** integration
- **Africa's Talking** SMS/WhatsApp services
- **Uganda Phone Number** formatting
- **UGX Currency** support
- **18% VAT** compliance
- **TIN Number** tracking

### Technical Features
- **React 18** frontend with modern UI
- **Node.js/Express** backend with SQLite
- **PostgreSQL** cloud database
- **Real-time Sync** engine with conflict resolution
- **JWT Authentication** with PIN and password login
- **Thermal Printer** support
- **Barcode Scanner** integration
- **PDF/Excel** report generation
- **Service Worker** for offline caching
- **Server-Sent Events** for real-time updates

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd uganda-supermarket

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Initialize database
cd server
npm run db:migrate
npm run db:seed

# Start development servers
npm run dev
```

### Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
# Server
PORT=4000
NODE_ENV=development
JWT_SECRET=your-secret-key

# Database
DB_PATH=./data/supermarket.db

# Africa's Talking
AT_USERNAME=sandbox
AT_API_KEY=your-api-key
AT_SENDER_ID=SUPERMARKET

# WhatsApp
WHATSAPP_TOKEN=your-whatsapp-token
WHATSAPP_PHONE_ID=123456789012345

# Mobile Money
MTN_PRIMARY_KEY=your-mtn-key
AIRTEL_CLIENT_ID=your-airtel-key

# Sync
CLOUD_API_URL=https://api.ugandasupermarket.com
MACHINE_ID=machine-001
MACHINE_SECRET=your-machine-secret
```

## 📁 Project Structure

```
uganda-supermarket/
├── client/                 # React frontend (PWA)
│   ├── src/
│   │   ├── api/         # API client
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom hooks
│   │   ├── pages/        # Page components
│   │   ├── store/        # Zustand state
│   │   └── styles/       # CSS/Tailwind
│   ├── public/              # Static assets
│   ├── package.json
│   └── vite.config.js
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── db/          # Database setup
│   │   ├── middleware/   # Express middleware
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Business logic
│   │   ├── sync/         # Sync engine
│   │   └── index.js      # Server entry
│   ├── data/               # SQLite database
│   └── package.json
├── desktop/                # Electron app
├── cloud/                  # Cloud API (PostgreSQL)
├── docker-compose.yml        # Development setup
├── package.json            # Root workspace
└── README.md
```

## 🎯 Usage

### Default login (local demo seed only)

After `npm run db:seed` (or first-run `SEED_IF_EMPTY`), the **demo** store uses fixed PINs for quick local testing: Admin `1234`, Manager `5678`, Cashier `9012`, store code `DEFAULT`. Staff web passwords for seeded users are documented in `server/src/db/seed.js` and `docs/DEPLOYMENT_AND_USAGE.md`.

**Production / real stores:** the public login page does **not** show any credentials. You (the developer) provision the first **admin** (Developer Console or seed), share their **store code** and sign-in with them privately, then the **admin** creates managers and cashiers under **Users** in the app.

### POS Workflow
1. **Login** with 4-digit PIN
2. **Add Products** via barcode scanner or search
3. **Select Customer** (optional)
4. **Apply Discount** if authorized
5. **Choose Payment Method** (Cash, MTN MoMo, Airtel Money)
6. **Complete Payment** and print/send receipt

### Mobile Money Integration
- **MTN Mobile Money**: Full API integration with status polling
- **Airtel Money**: Direct payment processing
- **Payment Confirmation**: Real-time status updates
- **Receipt Options**: SMS, WhatsApp, Print

### Sync Process
- **Automatic**: Every 60 seconds when online
- **Manual**: Force sync from settings
- **Conflict Resolution**: Multiple strategies available
- **Offline Mode**: Full functionality with local SQLite

## 📊 Reports

### Available Reports
- **Daily Sales**: Revenue, transactions, payment methods
- **Monthly Sales**: Month-over-month comparisons
- **Profit & Loss**: Cost analysis, margins
- **Best Sellers**: Top products by quantity/revenue
- **Cashier Performance**: Individual productivity metrics
- **Inventory Reports**: Low stock, expiring items

### Export Options
- **PDF**: Formatted reports for printing
- **Excel**: Data analysis spreadsheets
- **CSV**: Raw data export

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev              # Start all services
npm run dev:server        # Server only
npm run dev:client        # Client only

# Database
npm run db:migrate        # Run migrations
npm run db:seed          # Insert demo data
npm run db:reset          # Reset database

# Building
npm run build             # Build for production
npm run build:client       # Client only
npm run build:server       # Server only

# Testing
npm run test              # Run tests
npm run test:client       # Client tests
npm run test:server       # Server tests

# Deployment
npm run start              # Production mode
npm run docker:dev         # Docker development
npm run docker:prod        # Docker production
```

### API Endpoints

#### Authentication
- `POST /api/auth/login` - PIN login
- `POST /api/auth/login-web` - Email/password login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

#### Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `GET /api/products/barcode/:code` - Find by barcode

#### Sales
- `POST /api/sales` - Create sale
- `GET /api/sales` - List sales
- `POST /api/sales/:id/void` - Void sale
- `GET /api/sales/today-summary` - Today's summary

#### Customers
- `GET /api/customers` - List customers
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `POST /api/customers/:id/redeem-points` - Redeem points

#### Inventory
- `GET /api/inventory/low-stock` - Low stock items
- `GET /api/inventory/expiring` - Expiring products
- `POST /api/inventory/adjustments` - Stock adjustments

#### Reports
- `GET /api/reports/daily` - Daily sales report
- `GET /api/reports/monthly` - Monthly sales report
- `GET /api/reports/profit` - Profit & loss report
- `GET /api/reports/best-sellers` - Best sellers
- `GET /api/reports/cashier` - Cashier performance

#### Sync
- `GET /api/sync/status` - Sync status
- `POST /api/sync/push` - Push to cloud
- `POST /api/sync/pull` - Pull from cloud
- `POST /api/sync/force` - Force sync

## 🔒 Security

### Authentication
- **JWT Tokens** with expiration
- **PIN Validation** for cashiers
- **Role-Based Access** (Admin, Manager, Cashier)
- **Password Hashing** with bcrypt

### Data Protection
- **Input Validation** on all endpoints
- **SQL Injection Prevention** with parameterized queries
- **XSS Protection** with content sanitization
- **CORS Configuration** for API security

### Sync Security
- **Machine Authentication** with ID/secret
- **Encrypted Communication** with HTTPS
- **Conflict Resolution** with audit trail
- **Data Integrity** checks

## 🌐 Deployment

### Development Environment
```bash
# Using Docker Compose
docker-compose -f docker-compose.yml up

# Or individual services
npm run dev:server  # Port 4000
npm run dev:client  # Port 5173
```

### Production Environment
```bash
# Build all services
npm run build

# Start production server
npm start

# Using Docker
docker-compose -f docker-compose.prod.yml up
```

### Environment Variables
- `NODE_ENV=production` - Production mode
- `PORT=4000` - Server port
- `DB_PATH` - Database path
- `JWT_SECRET` - Authentication secret

## 📱 Mobile App

### PWA Features
- **Offline Support** with service worker
- **Install Prompt** for app installation
- **Push Notifications** (when supported)
- **Responsive Design** for all screen sizes
- **Touch-Optimized** UI for tablets/phones

### Installation
1. Open browser, navigate to app URL
2. Click "Add to Home Screen" (iOS) or "Install" (Android)
3. App works offline after installation

## 🖥️ Desktop App

### Electron Features
- **Native Menu** integration
- **System Tray** notifications
- **Auto-Updates** support
- **File System** access for receipts
- **Printer Integration** with native drivers

### Building Desktop App
```bash
cd desktop
npm run build
npm run package
```

## 🔄 Sync Architecture

### Local-First
- **SQLite Database** for offline operation
- **Automatic Sync** when online
- **Conflict Resolution** with multiple strategies
- **Change Tracking** with timestamps
- **Data Integrity** validation

### Cloud Integration
- **PostgreSQL** for cloud storage
- **RESTful API** for communication
- **Authentication** with machine credentials
- **Scalable** architecture for multiple stores

### Sync Strategies
1. **Latest Wins** - Most recent changes take precedence
2. **Local Wins** - Local changes take precedence
3. **Remote Wins** - Cloud changes take precedence
4. **Merge** - Intelligent field merging
5. **Manual** - User resolves conflicts

## 📧 Configuration

### Store Settings
- Store name, address, phone
- TIN number, tax rates
- Receipt customization
- Loyalty program settings

### Notification Settings
- Africa's Talking configuration
- WhatsApp Business setup
- Email server settings
- Notification templates

### Sync Settings
- Cloud API endpoint
- Machine credentials
- Sync interval configuration
- Conflict resolution strategy

## 🧪 Testing

### Test Coverage
- **Unit Tests** for business logic
- **Integration Tests** for API endpoints
- **E2E Tests** for user workflows
- **Performance Tests** for sync operations

### Running Tests
```bash
# All tests
npm test

# Client tests only
npm run test:client

# Server tests only
npm run test:server

# Coverage report
npm run test:coverage
```

## 📈 Performance

### Optimization
- **Lazy Loading** for large datasets
- **Indexing** for database queries
- **Caching** for frequently accessed data
- **Compression** for API responses
- **Service Worker** for offline caching

### Monitoring
- **Error Tracking** with detailed logs
- **Performance Metrics** collection
- **Sync Status** monitoring
- **Resource Usage** tracking

## 🐛 Troubleshooting

### Common Issues

#### Database Connection
```bash
# Check database file exists
ls -la data/supermarket.db

# Check permissions
chmod 664 data/supermarket.db

# Re-run migrations
npm run db:migrate
```

#### Sync Issues
```bash
# Check internet connection
ping google.com

# Test cloud API
curl -X GET https://your-cloud-api.com/health

# Force sync
npm run sync:force
```

#### Mobile Money
```bash
# Check API keys
echo $MTN_PRIMARY_KEY

# Test MTN connection
curl -X POST https://sandbox.momodeveloper.mtn.com

# Check logs
tail -f logs/mtn-momo.log
```

### Debug Mode
Enable debug logging:
```bash
DEBUG=app:* npm run dev:server
```

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request
5. Code review and merge

### Code Standards
- **ESLint** configuration
- **Prettier** formatting
- **TypeScript** types (when applicable)
- **Git Hooks** for quality

### Commit Messages
```
feat: Add new feature
fix: Bug fix
docs: Documentation update
style: Code formatting
refactor: Code refactoring
test: Add tests
chore: Maintenance task
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For support and questions:
- **Documentation**: Check the `/docs` directory
- **Issues**: Create GitHub issue
- **Email**: support@ugandasupermarket.com
- **Discord**: Community support channel

## 🗺️ Roadmap

### Upcoming Features
- **Multi-Store Support** - Manage multiple locations
- **Advanced Analytics** - AI-powered insights
- **Mobile App** - Native iOS/Android apps
- **API Rate Limiting** - Enhanced security
- **Audit Trail** - Complete change tracking
- **Backup System** - Automated backups
- **Theme Customization** - Store branding
- **Advanced Reporting** - Custom report builder
- **Integration APIs** - Third-party integrations

---

**Built with ❤️ for Ugandan businesses**

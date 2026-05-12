import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, Wifi, WifiOff, Database, Bell, Globe } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { syncAPI } from '../api/client';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';

const Settings = () => {
  const { hasRole } = useAuthStore();
  const { isOnline, isSyncing, getSyncStatusText, getLastSyncText, forceSync } = useSyncStore();
  
  const [activeTab, setActiveTab] = useState('general');
  const [storeSettings, setStoreSettings] = useState({
    store_name: 'My Supermarket',
    store_address: 'Kampala, Uganda',
    store_phone: '+256700000000',
    store_tin: '',
    receipt_footer: 'Thank you for shopping with us!'
  });
  const [syncSettings, setSyncSettings] = useState({
    cloud_api_url: '',
    sync_interval_seconds: 60,
    machine_id: '',
    machine_secret: ''
  });
  const [notificationSettings, setNotificationSettings] = useState({
    africastalking_username: '',
    africastalking_api_key: '',
    whatsapp_token: '',
    whatsapp_phone_id: '',
    mtn_primary_key: '',
    mtn_secondary_key: '',
    mtn_user_id: '',
    mtn_api_secret: '',
    airtel_client_id: '',
    airtel_client_secret: ''
  });

  const tabs = [
    { id: 'general', name: 'General', icon: SettingsIcon },
    { id: 'store', name: 'Store Info', icon: Globe },
    { id: 'sync', name: 'Sync', icon: Database },
    { id: 'notifications', name: 'Notifications', icon: Bell }
  ];

  const handleSaveSettings = async (category) => {
    try {
      // This would save to API
      console.log(`Saving ${category} settings:`, category === 'general' ? storeSettings : 
        category === 'store' ? storeSettings :
        category === 'sync' ? syncSettings : notificationSettings);
      
      // Simulate save
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert(`${category.charAt(0).toUpperCase() + category.slice(1)} settings saved successfully!`);
    } catch (error) {
      console.error('Save settings error:', error);
      alert('Failed to save settings');
    }
  };

  const handleForceSync = async () => {
    const result = await forceSync('both');
    if (result.success) {
      alert(`Sync completed! ${result.pushed} pushed, ${result.pulled} pulled`);
    } else {
      alert(`Sync failed: ${result.error}`);
    }
  };

  const handleInputChange = (category, field, value) => {
    switch (category) {
      case 'general':
        setStoreSettings(prev => ({ ...prev, [field]: value }));
        break;
      case 'store':
        setStoreSettings(prev => ({ ...prev, [field]: value }));
        break;
      case 'sync':
        setSyncSettings(prev => ({ ...prev, [field]: value }));
        break;
      case 'notifications':
        setNotificationSettings(prev => ({ ...prev, [field]: value }));
        break;
    }
  };

  if (!hasRole('admin')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <SettingsIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-600">Only administrators can access settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-green-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-600" />
            )}
            <span className="text-sm text-gray-600">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <Database className={`w-5 h-5 ${isSyncing ? 'text-yellow-600' : 'text-gray-600'}`} />
            <span className="text-sm text-gray-600">{getSyncStatusText()}</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <Card>
        <div className="flex space-x-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="font-medium">{tab.name}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Tab Content */}
      {activeTab === 'general' && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-6">General Settings</h2>
          <div className="space-y-6">
            <div>
              <label className="form-label">Default Currency</label>
              <select className="form-input" defaultValue="UGX" disabled>
                <option value="UGX">Ugandan Shilling (UGX)</option>
              </select>
            </div>
            
            <div>
              <label className="form-label">Tax Rate (%)</label>
              <Input
                type="number"
                value="18"
                disabled
                placeholder="18"
              />
            </div>
            
            <div>
              <label className="form-label">Loyalty Points Rate</label>
              <Input
                type="number"
                value="1"
                disabled
                placeholder="1 point per UGX 100"
              />
            </div>
            
            <div>
              <Button
                onClick={() => handleSaveSettings('general')}
                variant="primary"
              >
                <Save className="w-4 h-4 mr-2" />
                Save General Settings
              </Button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'store' && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Store Information</h2>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Store Name"
                value={storeSettings.store_name}
                onChange={(e) => handleInputChange('store', 'store_name', e.target.value)}
                placeholder="My Supermarket"
              />
              
              <Input
                label="Store Phone"
                value={storeSettings.store_phone}
                onChange={(e) => handleInputChange('store', 'store_phone', e.target.value)}
                placeholder="+256700000000"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Store Address"
                value={storeSettings.store_address}
                onChange={(e) => handleInputChange('store', 'store_address', e.target.value)}
                placeholder="Kampala, Uganda"
              />
              
              <Input
                label="TIN Number"
                value={storeSettings.store_tin}
                onChange={(e) => handleInputChange('store', 'store_tin', e.target.value)}
                placeholder="100123456789"
              />
            </div>
            
            <div>
              <label className="form-label">Receipt Footer</label>
              <Input
                as="textarea"
                rows={3}
                value={storeSettings.receipt_footer}
                onChange={(e) => handleInputChange('store', 'receipt_footer', e.target.value)}
                placeholder="Thank you for shopping with us!"
              />
            </div>
            
            <div>
              <Button
                onClick={() => handleSaveSettings('store')}
                variant="primary"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Store Settings
              </Button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'sync' && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Sync Configuration</h2>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Cloud API URL"
                value={syncSettings.cloud_api_url}
                onChange={(e) => handleInputChange('sync', 'cloud_api_url', e.target.value)}
                placeholder="https://api.ugandasupermarket.com"
              />
              
              <Input
                label="Sync Interval (seconds)"
                type="number"
                value={syncSettings.sync_interval_seconds}
                onChange={(e) => handleInputChange('sync', 'sync_interval_seconds', e.target.value)}
                placeholder="60"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Machine ID"
                value={syncSettings.machine_id}
                onChange={(e) => handleInputChange('sync', 'machine_id', e.target.value)}
                placeholder="machine-001"
              />
              
              <Input
                label="Machine Secret"
                type="password"
                value={syncSettings.machine_secret}
                onChange={(e) => handleInputChange('sync', 'machine_secret', e.target.value)}
                placeholder="•••••••••••"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <p>Last sync: {getLastSyncText()}</p>
                <p>Status: {getSyncStatusText()}</p>
              </div>
              
              <div className="flex space-x-4">
                <Button
                  onClick={handleForceSync}
                  disabled={isSyncing}
                  variant="secondary"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Force Sync
                </Button>
                
                <Button
                  onClick={() => handleSaveSettings('sync')}
                  variant="primary"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Sync Settings
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Notification Settings</h2>
          <div className="space-y-6">
            {/* Africa's Talking SMS */}
            <div className="border-b border-gray-200 pb-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Africa's Talking SMS</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Username"
                  value={notificationSettings.africastalking_username}
                  onChange={(e) => handleInputChange('notifications', 'africastalking_username', e.target.value)}
                  placeholder="sandbox"
                />
                
                <Input
                  label="API Key"
                  type="password"
                  value={notificationSettings.africastalking_api_key}
                  onChange={(e) => handleInputChange('notifications', 'africastalking_api_key', e.target.value)}
                  placeholder="•••••••••••"
                />
              </div>
            </div>

            {/* WhatsApp */}
            <div className="border-b border-gray-200 pb-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">WhatsApp</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Access Token"
                  type="password"
                  value={notificationSettings.whatsapp_token}
                  onChange={(e) => handleInputChange('notifications', 'whatsapp_token', e.target.value)}
                  placeholder="•••••••••••"
                />
                
                <Input
                  label="Phone ID"
                  value={notificationSettings.whatsapp_phone_id}
                  onChange={(e) => handleInputChange('notifications', 'whatsapp_phone_id', e.target.value)}
                  placeholder="123456789012345"
                />
              </div>
            </div>

            {/* MTN Mobile Money */}
            <div className="border-b border-gray-200 pb-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">MTN Mobile Money</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Primary Key"
                  type="password"
                  value={notificationSettings.mtn_primary_key}
                  onChange={(e) => handleInputChange('notifications', 'mtn_primary_key', e.target.value)}
                  placeholder="•••••••••••"
                />
                
                <Input
                  label="Secondary Key"
                  type="password"
                  value={notificationSettings.mtn_secondary_key}
                  onChange={(e) => handleInputChange('notifications', 'mtn_secondary_key', e.target.value)}
                  placeholder="•••••••••••"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="User ID"
                  value={notificationSettings.mtn_user_id}
                  onChange={(e) => handleInputChange('notifications', 'mtn_user_id', e.target.value)}
                  placeholder="user_001"
                />
                
                <Input
                  label="API Secret"
                  type="password"
                  value={notificationSettings.mtn_api_secret}
                  onChange={(e) => handleInputChange('notifications', 'mtn_api_secret', e.target.value)}
                  placeholder="•••••••••••"
                />
              </div>
            </div>

            {/* Airtel Money */}
            <div className="pb-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Airtel Money</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Client ID"
                  value={notificationSettings.airtel_client_id}
                  onChange={(e) => handleInputChange('notifications', 'airtel_client_id', e.target.value)}
                  placeholder="client_001"
                />
                
                <Input
                  label="Client Secret"
                  type="password"
                  value={notificationSettings.airtel_client_secret}
                  onChange={(e) => handleInputChange('notifications', 'airtel_client_secret', e.target.value)}
                  placeholder="•••••••••••"
                />
              </div>
            </div>
            
            <div>
              <Button
                onClick={() => handleSaveSettings('notifications')}
                variant="primary"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Notification Settings
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Settings;

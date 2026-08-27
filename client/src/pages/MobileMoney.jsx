import React from 'react';
import { Smartphone } from 'lucide-react';
import MoMoAgentSection from '../components/pos/MoMoAgentSection';

/** MoMo agent float screen — usage guide is in docs/DEPLOYMENT_AND_USAGE.md */
const MobileMoney = () => {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
        <Smartphone className="h-7 w-7 text-amber-600" aria-hidden />
        Mobile money
      </h1>
      <MoMoAgentSection />
    </div>
  );
};

export default MobileMoney;

import React from 'react';
import { Smartphone } from 'lucide-react';
import MoMoAgentSection from '../components/pos/MoMoAgentSection';

/**
 * Dedicated screen for in-store mobile money agent float and end-of-day balancing.
 * The same controls also appear at the bottom of POS for convenience during checkout.
 */
const MobileMoney = () => {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Smartphone className="h-7 w-7 text-amber-600" aria-hidden />
          Mobile money balancing
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          <strong>Admin or manager</strong> chooses which cashier receives the opening cash and MoMo
          float, opens the day, and runs end-of-day reconciliation. <strong>Cashiers</strong> record
          agent transactions (withdrawals, deposits, airtime, bills, send money) once float is open.
          This is separate from customer MoMo payments at checkout.
        </p>
      </div>
      <MoMoAgentSection />
    </div>
  );
};

export default MobileMoney;

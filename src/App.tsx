import { WalletProvider, ConnectButton, useWallet } from '@suiet/wallet-kit';
import type { Chain } from '@suiet/wallet-kit';
import { useState } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import './App.css';
import './wallet-modal.css';

function WalletInfo() {
  const wallet = useWallet();
  const [adviceMessage, setAdviceMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleProvideAdvice = async () => {
    if (!wallet.connected || !wallet.account) {
      setAdviceMessage('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setAdviceMessage('');

    try {
      console.log('Current wallet state:', {
        connected: wallet.connected,
        account: wallet.account?.address,
        chain: wallet.chain?.name
      });

      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [tx.pure(bcs.u64().serialize(1000000))]); // 0.001 SUI = 1,000,000 MIST
      tx.transferObjects(
        [coin],
        tx.pure(bcs.Address.serialize('0xf213f0c2b56cedcda27f673e6154d2241d65de65b3aa9d0cf42f27f4c54f2a01'))
      );

      console.log('Sending transaction...');
      const result = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: {
          showEffects: true,
          showEvents: true,
        }
      });

      console.log('Transaction result:', result);

      if (result.effects?.status?.status === 'success') {
        setAdviceMessage('Thank you for your advice! Your wisdom has been recorded.');
      } else {
        setAdviceMessage('Sorry, there was an error processing your advice. Please try again.');
      }
    } catch (error) {
      console.error('Transaction error:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      setAdviceMessage('Sorry, there was an error processing your advice. Please ensure you have at least 0.001 SUI in your wallet and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="wallet-info">
      <div className="network-info">
        <span className="network-label">Network:</span>
        <span className="network-value">{wallet.chain?.name || 'Not Connected'}</span>
      </div>
      <div className="address-info">
        <span className="address-label">Address:</span>
        <span className="address-value">
          {wallet.account?.address 
            ? `${wallet.account.address.slice(0, 6)}...${wallet.account.address.slice(-4)}`
            : 'Not Connected'}
        </span>
      </div>
      {wallet.connected && (
        <div className="advice-section">
          <button 
            className="advice-button"
            onClick={handleProvideAdvice}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'Provide Advice (0.001 SUI)'}
          </button>
          {adviceMessage && (
            <div className="advice-message">
              {adviceMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  const chains = [
    {
      id: 'sui:mainnet',
      name: 'Sui Mainnet',
      rpcUrl: 'https://fullnode.mainnet.sui.io',
    },
    {
      id: 'sui:testnet',
      name: 'Sui Testnet',
      rpcUrl: 'https://fullnode.testnet.sui.io',
    },
    {
      id: 'sui:devnet',
      name: 'Sui Devnet',
      rpcUrl: 'https://fullnode.devnet.sui.io',
    },
  ] as Chain[];

  return (
    <WalletProvider
      chains={chains}
      autoConnect={true}
    >
      <div className="App">
        <header className="App-header">
          <h1>Sui Wallet Connection Example</h1>
          <ConnectButton />
          <WalletInfo />
        </header>
      </div>
    </WalletProvider>
  );
}

export default App;

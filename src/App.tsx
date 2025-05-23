import { WalletProvider, ConnectButton, useWallet } from '@suiet/wallet-kit';
import type { Chain } from '@suiet/wallet-kit';
import { useState } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { SuiClient } from '@mysten/sui/client';
import './App.css';
import './wallet-modal.css';

function WalletInfo() {
  const wallet = useWallet();
  const [adviceMessage, setAdviceMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string>('');
  const [balance, setBalance] = useState<number>(0);
  const [txStatus, setTxStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [txError, setTxError] = useState<string | null>(null);

  const handleProvideAdvice = async () => {
    if (!wallet.connected || !wallet.account) {
      setAdviceMessage('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setAdviceMessage('');
    setTxHash('');
    setTxStatus('pending');
    setTxError(null);

    try {
      console.log('Current wallet state:', {
        connected: wallet.connected,
        account: wallet.account?.address,
        chain: wallet.chain?.name
      });

      // Create Sui client for the current network
      const client = new SuiClient({ url: wallet.chain?.rpcUrl || 'https://fullnode.testnet.sui.io' });
      
      // Fetch balance
      const suiBalance = await client.getBalance({ owner: wallet.account.address });
      console.log('Fetched balance (MIST):', suiBalance.totalBalance, 'Expected SUI:', Number(suiBalance.totalBalance) / 1_000_000_000);
      const currentBalance = Number(suiBalance.totalBalance);
      setBalance(currentBalance);
      
      const requiredAmount = 1_000_000; // 0.001 SUI in MIST
      if (currentBalance < requiredAmount) {
        setAdviceMessage('Insufficient balance. Please ensure you have at least 0.001 SUI.');
        setIsLoading(false);
        return;
      }

      // Get the wallet's coins
      const coins = await client.getCoins({
        owner: wallet.account.address,
        coinType: '0x2::sui::SUI'
      });
      
      if (coins.data.length === 0) {
        setAdviceMessage('No SUI coins found in your wallet.');
        setIsLoading(false);
        return;
      }

      // Use the first coin that has enough balance
      const coinWithBalance = coins.data.find(coin => 
        Number(coin.balance) >= requiredAmount
      );

      if (!coinWithBalance) {
        setAdviceMessage('No coin with sufficient balance found. Please ensure you have at least 0.001 SUI in a single coin.');
        setIsLoading(false);
        return;
      }

      // Log the coin object structure
      console.log('Coin object structure:', {
        coin: coinWithBalance,
        keys: Object.keys(coinWithBalance),
        values: Object.values(coinWithBalance)
      });

      // Verify the account is still connected and matches
      if (!wallet.connected || !wallet.account) {
        setAdviceMessage('Wallet disconnected. Please reconnect and try again.');
        setIsLoading(false);
        return;
      }

      // Create the transaction
      console.log('Creating transaction with coin:', {
        coinObjectId: coinWithBalance.coinObjectId,
        balance: coinWithBalance.balance,
        requiredAmount,
        walletAddress: wallet.account.address
      });

      const tx = new Transaction();
      tx.setSender(wallet.account.address);
      const [coin] = tx.splitCoins(tx.object(coinWithBalance.coinObjectId), [tx.pure(bcs.u64().serialize(requiredAmount))]);
      
      console.log('Split coin created:', {
        coinObjectId: coin,
        amount: requiredAmount,
        owner: wallet.account.address
      });

      tx.transferObjects(
        [coin],
        tx.pure(bcs.Address.serialize('0xf213f0c2b56cedcda27f673e6154d2241d65de65b3aa9d0cf42f27f4c54f2a01'))
      );

      // Verify wallet state before proceeding
      if (!wallet.connected || !wallet.account) {
        throw new Error('Wallet is not connected');
      }

      // Log the complete transaction details
      console.log('Transaction details:', {
        from: wallet.account.address,
        coinId: coinWithBalance.coinObjectId,
        amount: requiredAmount,
        connected: wallet.connected,
        chain: wallet.chain?.name,
        balance: currentBalance / 1_000_000_000, // Convert MIST to SUI
        walletName: wallet.name,
        account: wallet.account,
        transaction: tx.serialize()
      });

      try {
        console.log('Preparing to sign transaction...');
        
        // Log the current wallet state
        console.log('Current wallet state:', {
          connected: wallet.connected,
          address: wallet.account?.address,
          chain: wallet.chain?.name,
          name: wallet.name,
          account: wallet.account
        });

        // Check network connectivity with retries using SuiClient
        const checkNetwork = async (retries = 3, delay = 1000) => {
          for (let i = 0; i < retries; i++) {
            try {
              console.log(`Attempting network check (attempt ${i + 1}/${retries})...`);
              const rpcUrl = wallet.chain?.rpcUrl || 'https://fullnode.testnet.sui.io';
              console.log('Using RPC URL:', rpcUrl);
              
              const client = new SuiClient({ url: rpcUrl });
              const chainId = await client.getChainIdentifier();
              
              console.log('Network check successful:', {
                chainId,
                rpcUrl
              });
              return true;
            } catch (error) {
              console.error(`Network check attempt ${i + 1} failed:`, error);
              if (i === retries - 1) {
                throw new Error('Unable to connect to Sui network after multiple attempts. Please check your internet connection and try again.');
              }
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        };

        await checkNetwork();

        // Validate transaction block
        console.log('Validating transaction block:', {
          hasTransactions: !!tx.blockData?.transactions,
          transactionCount: tx.blockData?.transactions?.length,
          transactions: tx.blockData?.transactions
        });

        if (!tx.blockData?.transactions || tx.blockData.transactions.length === 0) {
          throw new Error('Transaction block is empty');
        }

        // Validate split coins transaction
        const splitCoinsTx = tx.blockData.transactions[0];
        console.log('Split coins transaction:', {
          kind: splitCoinsTx.kind,
          transaction: splitCoinsTx
        });

        if (splitCoinsTx.kind !== 'SplitCoins') {
          throw new Error('First transaction must be SplitCoins');
        }

        // Validate transfer objects transaction
        const transferTx = tx.blockData.transactions[1];
        console.log('Transfer objects transaction:', {
          kind: transferTx.kind,
          transaction: transferTx
        });

        if (transferTx.kind !== 'TransferObjects') {
          throw new Error('Second transaction must be TransferObjects');
        }

        // Add a small delay to ensure wallet state is stable
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify wallet state one final time
        if (!wallet.connected || !wallet.account) {
          throw new Error('Wallet disconnected during transaction preparation');
        }

        // Log the transaction block before signing
        console.log('Transaction block before signing:', {
          inputs: tx.blockData?.inputs,
          transactions: tx.blockData.transactions,
          sender: wallet.account.address
        });

        try {
          const result = await wallet.signAndExecuteTransactionBlock({
            transactionBlock: tx
          });

          console.log('Transaction result:', {
            digest: result.digest,
            effects: result.effects
          });

          setTxHash(result.digest);
          setTxStatus('success');
        } catch (error) {
          console.error('Transaction error:', error);
          setTxStatus('error');
          setTxError(error instanceof Error ? error.message : 'Transaction failed');
        }
      } catch (error) {
        console.error('Error:', error);
        setTxStatus('error');
        setTxError(error instanceof Error ? error.message : 'Transaction failed');
      }
    } catch (error) {
      console.error('Error:', error);
      setTxStatus('error');
      setTxError(error instanceof Error ? error.message : 'Transaction failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="wallet-info">
      <h2>Wallet Info</h2>
      {!wallet.connected ? (
        <p>Please connect your wallet</p>
      ) : (
        <div>
          <p>Connected to: {wallet.account?.address}</p>
          <p>Network: {wallet.chain?.name}</p>
          <p>Balance: {(balance / 1_000_000_000).toFixed(4)} SUI</p>
          {adviceMessage && <p className="advice-message">{adviceMessage}</p>}
          <button onClick={handleProvideAdvice} disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Provide Advice'}
          </button>
          {txStatus === 'success' && (
            <div className="success-message">
              <p>Transaction successful!</p>
              {txHash && (
                <div className="tx-hash">
                  <a href={`https://suiexplorer.com/txblock/${txHash}`} target="_blank" rel="noopener noreferrer">
                    View Transaction
                  </a>
                </div>
              )}
            </div>
          )}
          {txStatus === 'error' && (
            <div className="error-message">
              <p>Error: {txError}</p>
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
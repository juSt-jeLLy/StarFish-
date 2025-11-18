import React, { useState } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { SealClient } from '@mysten/seal';
import { toHex } from '@mysten/sui/utils';
import { toast } from "sonner";

interface WalrusEncryptUploadProps {
  audioBlob: Blob;
  language: string;
  dialect: string;
  duration: string;
  onSuccess: (datasetInfo: DatasetInfo) => void;
}

type DatasetInfo = {
  blobId: string;
  datasetId: string;
  txDigest: string;
};

const PACKAGE_ID = "0xb486f1a7bcca26a704f93e07439ea61d7f04f5855eaea850e40b5371d0b1a6b5"; // Package ID with publish function for WalrusBlob attachment
const SERVER_OBJECT_IDS = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8"
];

const WALRUS_PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";
const WALRUS_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";

export const WalrusEncryptUpload: React.FC<WalrusEncryptUploadProps> = ({
  audioBlob,
  language,
  dialect,
  duration,
  onSuccess,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo | null>(null);
  const suiClient = useSuiClient();
  const currentAccount = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const client = new SealClient({
    suiClient,
    serverConfigs: SERVER_OBJECT_IDS.map((id) => ({
      objectId: id,
      weight: 1,
    })),
    verifyKeyServers: false,
  });

  const handleUpload = async () => {
    if (!currentAccount?.address) {
      toast.error("Please connect your wallet");
      return;
    }

    setIsUploading(true);
    console.log('=== Upload Started ===');
    
    try {
      // 1. Read audio file as ArrayBuffer
      console.log('Step 1: Reading audio file...');
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = new Uint8Array(arrayBuffer);
      console.log('✓ Audio file read:', audioData.length, 'bytes');

      // 2. Create temporary dataset ID for encryption
      console.log('Step 2: Creating temporary dataset ID...');
      const tempDatasetId = crypto.getRandomValues(new Uint8Array(32));
      const nonce = crypto.getRandomValues(new Uint8Array(5));
      const id = toHex(new Uint8Array([...tempDatasetId, ...nonce]));
      console.log('✓ Dataset ID created:', id);

      // 3. Encrypt the audio data
      console.log('Step 3: Encrypting audio data...');
      toast.info("Encrypting audio data...");
      const { encryptedObject: encryptedBytes } = await client.encrypt({
        threshold: 2,
        packageId: PACKAGE_ID,
        id,
        data: audioData,
      });
      console.log('✓ Audio encrypted:', encryptedBytes.length, 'bytes');

      // 4. Upload encrypted data to Walrus
      console.log('Step 4: Uploading to Walrus...');
      toast.info("Uploading to Walrus...");
      const walrusUrl = `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=1`;
      console.log('Walrus endpoint:', walrusUrl);
      
      // Convert Uint8Array to Blob for proper upload
      const encryptedBlob = new Blob([encryptedBytes], { type: 'application/octet-stream' });
      console.log('Encrypted blob size:', encryptedBlob.size, 'bytes');
      
      const response = await fetch(walrusUrl, {
        method: 'PUT',
        body: encryptedBlob,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Walrus error response:', errorText);
        throw new Error(`Walrus upload failed with status ${response.status}: ${errorText}`);
      }

      const storageInfo = await response.json();
      console.log('✓ Walrus storage response received:', storageInfo);
      
      let blobId: string;

      if ('alreadyCertified' in storageInfo) {
        blobId = storageInfo.alreadyCertified.blobId;
        console.log('✓ Using already certified blob ID:', blobId);
      } else if ('newlyCreated' in storageInfo) {
        blobId = storageInfo.newlyCreated.blobObject.blobId;
        console.log('✓ Using newly created blob ID:', blobId);
      } else {
        throw new Error('Unexpected storage response format');
      }

      // 5. Create dataset on Sui blockchain (Step 1)
      console.log('Step 5: Creating dataset on blockchain...');
      toast.info("Creating dataset on blockchain...");
      const createTx = new Transaction();
      
      createTx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::create_dataset_entry`,
        arguments: [
          createTx.pure.string(language),
          createTx.pure.string(dialect),
          createTx.pure.string(duration),
          createTx.pure.string(blobId),
          createTx.object('0x6'), // Clock object
        ],
      });

      console.log('✓ Transaction built, executing...');
      console.log('Step 6: Waiting for wallet signature and execution...');
      
      // Execute first transaction
      const datasetId = await new Promise<string>((resolve, reject) => {
        signAndExecute(
          { transaction: createTx },
          {
            onSuccess: async (result: any) => {
              console.log('Step 7: Create dataset transaction executed successfully!');
              console.log('Transaction digest:', result.digest);
              console.log('Full result:', JSON.stringify(result, null, 2));
              
              // Wait a bit for transaction to be indexed
              await new Promise(r => setTimeout(r, 2000));
              
              // Retry logic to fetch transaction details
              let extractedId: string | null = null;
              let retries = 0;
              const maxRetries = 5;
              
              while (!extractedId && retries < maxRetries) {
                try {
                  console.log(`Attempt ${retries + 1}/${maxRetries} to fetch transaction details...`);
                  
                  const txDetails = await suiClient.getTransactionBlock({
                    digest: result.digest,
                    options: {
                      showEffects: true,
                      showEvents: true,
                      showInput: false,
                    },
                  });
                  
                  console.log('Transaction details fetched:', JSON.stringify(txDetails, null, 2));
                  
                  // Try to get from events first
                  if (txDetails.events && Array.isArray(txDetails.events)) {
                    console.log('Checking events...');
                    for (const event of txDetails.events) {
                      console.log('Event type:', event.type);
                      if (event.type && event.type.includes('DatasetCreated')) {
                        const parsedJson = event.parsedJson as any;
                        if (parsedJson && typeof parsedJson === 'object' && 'dataset_id' in parsedJson) {
                          extractedId = parsedJson.dataset_id;
                          console.log('✓ Found dataset ID from DatasetCreated event:', extractedId);
                          break;
                        }
                      }
                    }
                  }
                  
                  // Fallback: get from created objects
                  if (!extractedId && txDetails.effects?.created && txDetails.effects.created.length > 0) {
                    console.log('Checking created objects...');
                    for (let i = 0; i < txDetails.effects.created.length; i++) {
                      const created = txDetails.effects.created[i];
                      console.log(`Created[${i}]:`, JSON.stringify(created, null, 2));
                      const objectId = created?.reference?.objectId;
                      const owner = created?.owner;
                      
                      // Look for owned objects (VoiceDataset or DatasetCap)
                      if (objectId && owner && typeof owner === 'object' && 'AddressOwner' in owner) {
                        extractedId = objectId;
                        console.log(`✓ Found dataset ID from effects.created[${i}]:`, extractedId);
                        break;
                      }
                    }
                  }
                  
                  if (extractedId) {
                    console.log('✓ Dataset ID extracted:', extractedId);
                    break;
                  }
                  
                  retries++;
                  if (retries < maxRetries) {
                    const delayMs = 1000 * Math.pow(2, retries); // Exponential backoff
                    console.log(`Retrying in ${delayMs}ms...`);
                    await new Promise(r => setTimeout(r, delayMs));
                  }
                } catch (fetchError: any) {
                  console.warn(`Fetch attempt ${retries + 1} failed:`, fetchError?.message);
                  retries++;
                  if (retries < maxRetries) {
                    const delayMs = 1000 * Math.pow(2, retries);
                    await new Promise(r => setTimeout(r, delayMs));
                  }
                }
              }
              
              if (extractedId) {
                console.log('✓ Dataset ID extracted:', extractedId);
                resolve(extractedId);
              } else {
                console.error('✗ Could not extract dataset ID after retries');
                console.error('Result object:', result);
                reject(new Error('Could not extract dataset ID from transaction after retries'));
              }
            },
            onError: (error: any) => {
              console.error('✗ Create dataset transaction error:', error);
              toast.error("Failed to create dataset: " + (error?.message || 'Unknown error'));
              reject(error);
            },
          }
        );
      });

      // 6. Publish (attach) the Walrus blob to the dataset (Step 2)
      console.log('Step 8: Publishing blob to dataset...');
      toast.info("Attaching blob to dataset as NFT...");
      
      await new Promise<void>((resolve, reject) => {
        const publishTx = new Transaction();
        
        publishTx.moveCall({
          target: `${PACKAGE_ID}::voice_marketplace::publish_entry`,
          arguments: [
            publishTx.object(datasetId),        // VoiceDataset object
            publishTx.object(datasetId),        // DatasetCap (same ID pattern, need to fetch)
            publishTx.pure.string(blobId),      // blob_id
            publishTx.object('0x6'),             // Clock object
          ],
        });

        signAndExecute(
          { transaction: publishTx },
          {
            onSuccess: (result: any) => {
              console.log('Step 9: Publish transaction executed successfully!');
              console.log('Blob attached to dataset, transaction digest:', result.digest);
              toast.success("Blob attached successfully!");
              
              // Store dataset info for display
              const info: DatasetInfo = {
                blobId: blobId,
                datasetId: datasetId,
                txDigest: result.digest,
              };
              setDatasetInfo(info);
              
              onSuccess(info);
              setIsUploading(false);
              resolve();
            },
            onError: (error: any) => {
              console.error('✗ Publish transaction error:', error);
              toast.error("Failed to attach blob: " + (error?.message || 'Unknown error'));
              setIsUploading(false);
              reject(error);
            },
          }
        );
      });

      console.log('=== Upload Completed Successfully ===');
    } catch (error: any) {
      console.error('=== Upload Failed ===');
      console.error('Error:', error);
      console.error('Error stack:', error?.stack);
      toast.error(`Upload failed: ${error?.message || 'Unknown error'}`);
      setIsUploading(false);
    }
  };

  return (
    <Card className="p-6 neon-border bg-card/80 backdrop-blur">
      <div className="text-center">
        <h3 className="text-xl font-bold text-primary mb-4">
          Publish to Marketplace
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Your voice recording will be encrypted and uploaded to Walrus.
          Other users can purchase access for 0.01 SUI.
        </p>
        
        {!datasetInfo ? (
          <Button
            size="lg"
            onClick={handleUpload}
            disabled={isUploading || !currentAccount}
            className="bg-gradient-to-r from-primary to-secondary text-background font-bold px-8 py-4 pixel-border"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                UPLOADING...
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 mr-2" />
                PUBLISH TO MARKETPLACE
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-4 text-left">
            <div className="bg-background/50 border border-primary/30 rounded-lg p-4">
              <h4 className="font-bold text-primary mb-4">✓ Dataset Published Successfully!</h4>
              
              <div className="space-y-4">
                {/* Walrus Blob */}
                <div className="border border-secondary/30 rounded p-3 bg-background/30">
                  <dt className="text-muted-foreground font-semibold mb-2">Walrus Encrypted Blob</dt>
                  <dd className="text-foreground break-all font-mono text-xs mb-3 p-2 bg-background rounded">{datasetInfo.blobId}</dd>
                  <a
                    href={`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${datasetInfo.blobId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-secondary hover:text-secondary/80 underline font-semibold"
                  >
                    View Encrypted Blob on Walrus →
                  </a>
                </div>
                
                {/* Sui Object */}
                <div className="border border-accent/30 rounded p-3 bg-background/30">
                  <dt className="text-muted-foreground font-semibold mb-2">Sui Blockchain Object</dt>
                  <dd className="text-foreground break-all font-mono text-xs mb-3 p-2 bg-background rounded">{datasetInfo.datasetId}</dd>
                  <a
                    href={`https://suiscan.xyz/testnet/object/${datasetInfo.datasetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent/80 underline font-semibold"
                  >
                    View on Suiscan Explorer →
                  </a>
                </div>
              </div>
            </div>
            
            <Button
              size="lg"
              onClick={() => {
                setDatasetInfo(null);
                window.location.reload();
              }}
              className="w-full bg-primary hover:bg-primary/90 text-background font-bold"
            >
              Publish Another Recording
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};
export default WalrusEncryptUpload;
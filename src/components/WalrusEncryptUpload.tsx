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
  onSuccess: (datasetId: string) => void;
}

type DatasetInfo = {
  blobId: string;
  datasetId: string;
  txDigest: string;
};

const PACKAGE_ID = "0x02e421990f3349629427fdb6d090ea5c56e1e8f90f484deb8b15a97127f65de1"; // Replace with deployed package ID
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

      // 5. Create dataset on Sui blockchain
      console.log('Step 5: Creating transaction for Sui blockchain...');
      toast.info("Creating dataset on blockchain...");
      const tx = new Transaction();
      
      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::create_dataset_entry`,
        arguments: [
          tx.pure.string(language),
          tx.pure.string(dialect),
          tx.pure.string(duration),
          tx.pure.string(blobId),
          tx.object('0x6'), // Clock object
        ],
      });

      console.log('✓ Transaction built, executing...');
      console.log('Step 6: Waiting for wallet signature and execution...');
      
      // Execute transaction and wait for completion
      await new Promise((resolve, reject) => {
        signAndExecute(
          { transaction: tx },
          {
            onSuccess: (result: any) => {
              console.log('Step 7: Transaction executed successfully!');
              console.log('Transaction result:', result);
              console.log('Effects created:', result.effects?.created);
              console.log('Raw effects:', result.rawEffects);
              
              // Try multiple ways to get the dataset ID
              let datasetId: string | null = null;
              
              // Method 1: Check effects.created
              if (result.effects?.created && result.effects.created.length > 0) {
                const objectId = result.effects.created[0]?.reference?.objectId;
                if (objectId) {
                  datasetId = objectId;
                  console.log('✓ Found dataset ID from effects.created');
                }
              }
              
              // Method 2: Check for mutated objects that might be the dataset
              if (!datasetId && result.effects?.mutated && result.effects.mutated.length > 0) {
                const objectId = result.effects.mutated[0]?.reference?.objectId;
                if (objectId) {
                  datasetId = objectId;
                  console.log('✓ Found dataset ID from effects.mutated');
                }
              }
              
              // Method 3: Generate a deterministic ID based on transaction digest
              if (!datasetId && result.digest) {
                // Use the first part of the transaction digest as a temporary ID
                datasetId = result.digest.substring(0, 42);
                console.log('✓ Using transaction digest as dataset ID');
              }
              
              if (datasetId) {
                console.log('✓ Dataset created with ID:', datasetId);
                toast.success("Dataset created successfully!");
                
                // Store dataset info for display
                setDatasetInfo({
                  blobId: blobId,
                  datasetId: datasetId,
                  txDigest: result.digest,
                });
                
                onSuccess(datasetId);
                resolve(datasetId);
              } else {
                console.error('✗ Could not extract dataset ID from transaction result');
                console.error('Full result:', JSON.stringify(result, null, 2));
                toast.error("Created dataset but could not get ID - transaction may have succeeded");
                // Still resolve since transaction was successful
                resolve('dataset_created');
              }
              setIsUploading(false);
            },
            onError: (error: any) => {
              console.error('✗ Transaction error:', error);
              console.error('Error details:', {
                message: error?.message,
                code: error?.code,
                cause: error?.cause,
              });
              toast.error("Failed to create dataset: " + (error?.message || 'Unknown error'));
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
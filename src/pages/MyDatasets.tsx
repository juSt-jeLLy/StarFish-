import { useState, useEffect } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  Database, 
  Users, 
  DollarSign, 
  Calendar,
  Eye,
  Filter,
  Loader2,
  Activity,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Crown
} from "lucide-react";
import Navigation from "@/components/Navigation";
import spaceBg from "@/assets/space-bg.jpg";
import { config } from '@/config/env';
import { toast } from "sonner";

const PACKAGE_ID = config.packageId;
const BASE_PRICE_PER_DAY = config.pricing.basePricePerDay;

interface DatasetStats {
  id: string;
  language: string;
  dialect: string;
  durationLabel: string;
  durationSeconds: number;
  blobId: string;
  createdAt: number;
  totalPurchases: number;
  activePurchases: number;
  totalRevenue: number;
  recentPurchases: PurchaseData[];
}

interface PurchaseData {
  subscriber: string;
  purchaseDate: number;
  expiryDate: number;
  daysPurchased: number;
  pricePaid: number;
  discountApplied: number;
  isActive: boolean;
}

const MyDatasets = () => {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  
  const [loading, setLoading] = useState(true);
  const [datasets, setDatasets] = useState<DatasetStats[]>([]);
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  const [timeFilter, setTimeFilter] = useState<'all' | '7d' | '30d' | '90d'>('all');
  
  // Summary stats
  const totalDatasets = datasets.length;
  const totalRevenue = datasets.reduce((sum, d) => sum + d.totalRevenue, 0);
  const totalPurchases = datasets.reduce((sum, d) => sum + d.totalPurchases, 0);
  const activePurchases = datasets.reduce((sum, d) => sum + d.activePurchases, 0);

  useEffect(() => {
    if (currentAccount?.address) {
      loadDashboardData();
      const interval = setInterval(loadDashboardData, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [currentAccount?.address]);

  const loadDashboardData = async () => {
    if (!currentAccount?.address) return;
    
    setLoading(true);
    try {
      // 1. Get all DatasetCreated events
      const createdEvents = await suiClient.queryEvents({
        query: {
          MoveEventType: `${PACKAGE_ID}::voice_marketplace::DatasetCreated`,
        },
        limit: 1000,
      });

      // Filter for this creator's datasets
      const myDatasetEvents = createdEvents.data.filter(
        (event: any) => event.parsedJson.creator === currentAccount.address
      );

      if (myDatasetEvents.length === 0) {
        setDatasets([]);
        setLoading(false);
        return;
      }

      // 2. Get all SubscriptionPurchased events
      const purchaseEvents = await suiClient.queryEvents({
        query: {
          MoveEventType: `${PACKAGE_ID}::voice_marketplace::SubscriptionPurchased`,
        },
        limit: 1000,
      });

      // 3. Build dataset stats
      const statsMap = new Map<string, DatasetStats>();
      const currentTime = Date.now();

      // Initialize dataset stats
      for (const event of myDatasetEvents) {
        const datasetId = (event.parsedJson as any).dataset_id;
        
        // Fetch dataset object to get full details
        let durationLabel = '';
        let blobId = '';
        try {
          const datasetObj = await suiClient.getObject({
            id: datasetId,
            options: { showContent: true },
          });
          const fields = (datasetObj.data?.content as any)?.fields;
          if (fields) {
            durationLabel = (fields as any).duration_label || '';
            blobId = (fields as any).blob_id || '';
          }
        } catch (err) {
          console.error('Error fetching dataset:', datasetId, err);
        }

        statsMap.set(datasetId, {
          id: datasetId,
          language: (event.parsedJson as any).language,
          dialect: (event.parsedJson as any).dialect,
          durationLabel,
          durationSeconds: parseInt((event.parsedJson as any).duration_seconds),
          blobId,
          createdAt: event.timestampMs ? parseInt(event.timestampMs) : Date.now(),
          totalPurchases: 0,
          activePurchases: 0,
          totalRevenue: 0,
          recentPurchases: [],
        });
      }

      // Process purchases for my datasets
      for (const event of purchaseEvents.data) {
        const parsed = event.parsedJson as any;
        const datasetId = parsed.dataset_id;
        
        // Only process if this is my dataset
        if (statsMap.has(datasetId)) {
          const stats = statsMap.get(datasetId)!;
          
          const purchaseDate = event.timestampMs ? parseInt(event.timestampMs) : 0;
          const expiryDate = parseInt(parsed.expires_at);
          const isActive = currentTime <= expiryDate;
          
          const purchase: PurchaseData = {
            subscriber: parsed.subscriber,
            purchaseDate,
            expiryDate,
            daysPurchased: parseInt(parsed.days_purchased),
            pricePaid: parseInt(parsed.final_price),
            discountApplied: parseInt(parsed.discount_applied || '0'),
            isActive,
          };
          
          stats.totalPurchases++;
          stats.totalRevenue += purchase.pricePaid;
          if (isActive) stats.activePurchases++;
          stats.recentPurchases.push(purchase);
          
          statsMap.set(datasetId, stats);
        }
      }

      // Sort purchases by date (most recent first)
      statsMap.forEach(stats => {
        stats.recentPurchases.sort((a, b) => b.purchaseDate - a.purchaseDate);
      });

      // Convert to array and sort by revenue
      const statsArray = Array.from(statsMap.values());
      statsArray.sort((a, b) => b.totalRevenue - a.totalRevenue);
      
      setDatasets(statsArray);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (mist: number): string => {
    return (mist / 1_000_000_000).toFixed(4);
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const shortenAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const toggleDataset = (datasetId: string) => {
    const newExpanded = new Set(expandedDatasets);
    if (newExpanded.has(datasetId)) {
      newExpanded.delete(datasetId);
    } else {
      newExpanded.add(datasetId);
    }
    setExpandedDatasets(newExpanded);
  };

  const filterPurchasesByTime = (purchases: PurchaseData[]) => {
    if (timeFilter === 'all') return purchases;
    
    const now = Date.now();
    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
    const cutoff = now - (daysMap[timeFilter] * 24 * 60 * 60 * 1000);
    
    return purchases.filter(p => p.purchaseDate >= cutoff);
  };

  const getTimeFilterLabel = () => {
    const map = {
      'all': 'All Time',
      '7d': 'Last 7 Days',
      '30d': 'Last 30 Days',
      '90d': 'Last 90 Days',
    };
    return map[timeFilter];
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${spaceBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      />
      
      <div className="fixed inset-0 scanlines pointer-events-none z-10" />
      
      <Navigation />

      <div className="relative z-20 pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-7xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-bold neon-text glitch mb-4">
              MY DATASETS
            </h1>
            <p className="text-muted-foreground">Track your datasets, earnings, and subscriber activity</p>
          </div>

          {!currentAccount ? (
            <Card className="p-12 text-center neon-border bg-card/80 backdrop-blur">
              <Database className="w-16 h-16 mx-auto mb-4 text-secondary" />
              <h2 className="text-2xl font-bold text-primary mb-4">Creator Dashboard</h2>
              <p className="text-muted-foreground">
                Please connect your wallet to view your creator statistics
              </p>
            </Card>
          ) : loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
          ) : datasets.length === 0 ? (
            <Card className="p-12 text-center neon-border bg-card/80 backdrop-blur">
              <Database className="w-16 h-16 mx-auto mb-4 text-secondary" />
              <h3 className="text-xl font-bold text-primary mb-2">No Datasets Yet</h3>
              <p className="text-muted-foreground mb-6">
                Start recording and publishing voice datasets to track your earnings here
              </p>
              <Button 
                onClick={() => window.location.href = '/record'}
                className="bg-gradient-to-r from-primary to-secondary text-background font-bold pixel-border"
              >
                Create Your First Dataset
              </Button>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <Card className="p-6 neon-border bg-gradient-to-br from-primary/20 to-primary/5 backdrop-blur">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-primary text-sm font-medium">Total Datasets</span>
                    <Database className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-3xl font-bold text-foreground">{totalDatasets}</p>
                  <p className="text-xs text-muted-foreground mt-1">Published datasets</p>
                </Card>

                <Card className="p-6 neon-border bg-gradient-to-br from-accent/20 to-accent/5 backdrop-blur">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-accent text-sm font-medium">Total Revenue</span>
                    <DollarSign className="w-5 h-5 text-accent" />
                  </div>
                  <p className="text-3xl font-bold text-foreground">{formatPrice(totalRevenue)} SUI</p>
                  <p className="text-xs text-muted-foreground mt-1">Lifetime earnings</p>
                </Card>

                <Card className="p-6 neon-border bg-gradient-to-br from-secondary/20 to-secondary/5 backdrop-blur">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-secondary text-sm font-medium">Total Sales</span>
                    <Users className="w-5 h-5 text-secondary" />
                  </div>
                  <p className="text-3xl font-bold text-foreground">{totalPurchases}</p>
                  <p className="text-xs text-muted-foreground mt-1">All-time purchases</p>
                </Card>

                <Card className="p-6 neon-border bg-gradient-to-br from-amber-500/20 to-amber-500/5 backdrop-blur">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-amber-400 text-sm font-medium">Active Subs</span>
                    <Activity className="w-5 h-5 text-amber-400" />
                  </div>
                  <p className="text-3xl font-bold text-foreground">{activePurchases}</p>
                  <p className="text-xs text-muted-foreground mt-1">Current subscribers</p>
                </Card>
              </div>

              {/* Time Filter */}
              <Card className="p-4 mb-6 neon-border bg-card/80 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-primary" />
                    <span className="font-bold text-primary">Time Period:</span>
                  </div>
                  <div className="flex gap-2">
                    {(['all', '7d', '30d', '90d'] as const).map(filter => (
                      <Button
                        key={filter}
                        variant={timeFilter === filter ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTimeFilter(filter)}
                        className="pixel-border"
                      >
                        {filter === 'all' ? 'All Time' : filter === '7d' ? '7 Days' : filter === '30d' ? '30 Days' : '90 Days'}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Datasets List */}
              <div className="space-y-6">
                {datasets.map(dataset => {
                  const filteredPurchases = filterPurchasesByTime(dataset.recentPurchases);
                  const filteredRevenue = filteredPurchases.reduce((sum, p) => sum + p.pricePaid, 0);
                  const isExpanded = expandedDatasets.has(dataset.id);
                  
                  return (
                    <Card 
                      key={dataset.id}
                      className="neon-border bg-card/80 backdrop-blur overflow-hidden"
                    >
                      {/* Dataset Header */}
                      <div 
                        className="p-6 cursor-pointer hover:bg-primary/5 transition-colors"
                        onClick={() => toggleDataset(dataset.id)}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-2xl font-bold text-primary">
                                {dataset.language} - {dataset.dialect}
                              </h3>
                              <Crown className="w-5 h-5 text-accent" />
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>📅 Created {formatDate(dataset.createdAt)}</span>
                              <span>⏱️ {dataset.durationLabel}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-bold text-accent">
                              {formatPrice(filteredRevenue)} SUI
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getTimeFilterLabel()}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center p-3 bg-secondary/10 border border-secondary/30 rounded">
                            <p className="text-2xl font-bold text-secondary">{filteredPurchases.length}</p>
                            <p className="text-xs text-muted-foreground">Purchases</p>
                          </div>
                          <div className="text-center p-3 bg-amber-500/10 border border-amber-500/30 rounded">
                            <p className="text-2xl font-bold text-amber-400">
                              {filteredPurchases.filter(p => p.isActive).length}
                            </p>
                            <p className="text-xs text-muted-foreground">Active</p>
                          </div>
                          <div className="text-center p-3 bg-primary/10 border border-primary/30 rounded">
                            <p className="text-2xl font-bold text-primary">
                              {formatPrice(filteredRevenue / Math.max(filteredPurchases.length, 1))}
                            </p>
                            <p className="text-xs text-muted-foreground">Avg. Sale</p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-center text-sm text-primary">
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-4 h-4 mr-1" />
                              Hide Purchase Details
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4 mr-1" />
                              View Purchase Details
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="px-6 pb-6 border-t border-primary/20">
                          <div className="mt-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-foreground flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Recent Purchases ({filteredPurchases.length})
                              </h4>
                              <a
                                href={`https://suiscan.xyz/testnet/object/${dataset.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-accent hover:text-accent/80 flex items-center gap-1"
                              >
                                View on Explorer
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            
                            {filteredPurchases.length === 0 ? (
                              <p className="text-sm text-muted-foreground italic p-4 bg-background/50 rounded text-center">
                                No purchases in this time period
                              </p>
                            ) : (
                              <div className="space-y-2 max-h-80 overflow-y-auto">
                                {filteredPurchases.map((purchase, idx) => (
                                  <div 
                                    key={idx}
                                    className="flex items-center justify-between p-4 bg-background/50 border border-primary/10 rounded hover:bg-background/70 transition-colors"
                                  >
                                    <div className="flex-1">
                                      <p className="font-mono text-secondary font-bold">
                                        {shortenAddress(purchase.subscriber)}
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {formatDateTime(purchase.purchaseDate)} • {purchase.daysPurchased} day{purchase.daysPurchased !== 1 ? 's' : ''}
                                      </p>
                                      {purchase.discountApplied > 0 && (
                                        <p className="text-xs text-amber-500 mt-1">
                                          Creator discount applied: {formatPrice(purchase.discountApplied)} SUI
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p className="font-bold text-accent text-lg">
                                        +{formatPrice(purchase.pricePaid)} SUI
                                      </p>
                                      {purchase.isActive ? (
                                        <span className="text-xs text-green-500 flex items-center justify-end gap-1">
                                          <Activity className="w-3 h-3" />
                                          Active until {formatDate(purchase.expiryDate)}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">
                                          Expired
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyDatasets;
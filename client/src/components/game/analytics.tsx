import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Target, DollarSign, Package, Users } from "lucide-react";

interface AnalyticsProps {
  gameSession: any;
  currentState: any;
}

export default function Analytics({ gameSession, currentState }: AnalyticsProps) {
  const { data: gameConstants } = useQuery({
    queryKey: ['/api/game/constants'],
    retry: false,
  });

  const { data: allWeeklyStates } = useQuery({
    queryKey: [`/api/game/${gameSession?.id}/weeks`],
    enabled: !!gameSession?.id,
    retry: false,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Sample data for charts (in real implementation, this would come from allWeeklyStates)
  const weeklyPerformanceData = [
    { week: 1, cash: 1000000, inventory: 0, sales: 0 },
    { week: 2, cash: 950000, inventory: 0, sales: 0 },
    { week: 3, cash: 800000, inventory: 50000, sales: 0 },
    { week: 4, cash: 650000, inventory: 100000, sales: 0 },
    { week: 5, cash: 500000, inventory: 150000, sales: 0 },
    { week: 6, cash: 400000, inventory: 200000, sales: 0 },
    { week: 7, cash: 450000, inventory: 180000, sales: 20000 },
    { week: 8, cash: 520000, inventory: 160000, sales: 40000 },
  ];

  const demandForecastData = [
    { week: 7, projected: 25000, actual: 20000 },
    { week: 8, projected: 30000, actual: 28000 },
    { week: 9, projected: 35000, actual: null },
    { week: 10, projected: 40000, actual: null },
    { week: 11, projected: 35000, actual: null },
    { week: 12, projected: 25000, actual: null },
  ];

  const costBredownData = [
    { name: 'Materials', value: 65, color: '#3B82F6' },
    { name: 'Production', value: 20, color: '#10B981' },
    { name: 'Logistics', value: 8, color: '#F59E0B' },
    { name: 'Marketing', value: 5, color: '#8B5CF6' },
    { name: 'Interest', value: 2, color: '#EF4444' },
  ];

  const productPerformanceData = [
    { product: 'Jacket', demand: 85000, sales: 72000, margin: 45 },
    { product: 'Dress', demand: 125000, sales: 118000, margin: 52 },
    { product: 'Pants', demand: 95000, sales: 89000, margin: 38 },
  ];

  const currentWeek = currentState?.weekNumber || 1;
  const isGameActive = currentWeek >= 7;

  const kpiData = [
    {
      title: "Service Level",
      value: isGameActive ? "94.2%" : "--",
      change: isGameActive ? -1.8 : 0,
      target: "≥95%",
      icon: Target,
      status: isGameActive ? (94.2 >= 95 ? "success" : "warning") : "neutral"
    },
    {
      title: "Economic Profit",
      value: isGameActive ? formatCurrency(2850000) : formatCurrency(0),
      change: isGameActive ? 12.5 : 0,
      target: "Maximize",
      icon: DollarSign,
      status: isGameActive ? "success" : "neutral"
    },
    {
      title: "Inventory Turnover",
      value: isGameActive ? "3.2x" : "--",
      change: isGameActive ? 0.4 : 0,
      target: "4-6x",
      icon: Package,
      status: isGameActive ? "warning" : "neutral"
    },
    {
      title: "Market Share",
      value: isGameActive ? "12.8%" : "--",
      change: isGameActive ? 2.1 : 0,
      target: "15%+",
      icon: Users,
      status: isGameActive ? "success" : "neutral"
    },
  ];

  const renderTrendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="text-green-600" size={16} />;
    if (change < 0) return <TrendingDown className="text-red-600" size={16} />;
    return <Minus className="text-gray-400" size={16} />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'danger': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Performance Analytics</h1>
        <p className="text-gray-600">
          Track your performance across key business metrics and make data-driven decisions
        </p>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {kpiData.map((kpi) => {
          const IconComponent = kpi.icon;
          return (
            <Card key={kpi.title} className={`border ${getStatusColor(kpi.status)} border-opacity-30`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600">{kpi.title}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                    <div className="flex items-center mt-2 gap-1">
                      {renderTrendIcon(kpi.change)}
                      <span className={`text-sm ${
                        kpi.change > 0 ? 'text-green-600' : 
                        kpi.change < 0 ? 'text-red-600' : 'text-gray-400'
                      }`}>
                        {kpi.change !== 0 ? `${kpi.change > 0 ? '+' : ''}${kpi.change}%` : '--'}
                      </span>
                    </div>
                  </div>
                  <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                    kpi.status === 'success' ? 'bg-green-100' :
                    kpi.status === 'warning' ? 'bg-yellow-100' :
                    kpi.status === 'danger' ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    <IconComponent className={
                      kpi.status === 'success' ? 'text-green-600' :
                      kpi.status === 'warning' ? 'text-yellow-600' :
                      kpi.status === 'danger' ? 'text-red-600' : 'text-gray-400'
                    } size={24} />
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Target: {kpi.target}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="performance" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="demand">Demand</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6">
          {/* Weekly Performance Trends */}
          <Card className="border border-gray-100">
            <CardHeader>
              <CardTitle>Weekly Performance Trends</CardTitle>
              <p className="text-sm text-gray-600">Track cash flow, inventory levels, and sales over time</p>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="week" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `£${(value / 1000)}k`}
                    />
                    <Tooltip 
                      formatter={(value, name) => [formatCurrency(Number(value)), name]}
                      labelFormatter={(label) => `Week ${label}`}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cash" 
                      stroke="#3B82F6" 
                      strokeWidth={2}
                      name="Cash on Hand"
                      dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="inventory" 
                      stroke="#10B981" 
                      strokeWidth={2}
                      name="Inventory Value"
                      dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="sales" 
                      stroke="#F59E0B" 
                      strokeWidth={2}
                      name="Weekly Sales"
                      dot={{ fill: '#F59E0B', strokeWidth: 2, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-6">
          {/* Cost Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border border-gray-100">
              <CardHeader>
                <CardTitle>Cost Structure Breakdown</CardTitle>
                <p className="text-sm text-gray-600">Distribution of total costs by category</p>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={costBredownData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {costBredownData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${value}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {costBredownData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: item.color }}
                        ></div>
                        <span className="text-sm text-gray-600">{item.name}</span>
                      </div>
                      <span className="text-sm font-medium">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-100">
              <CardHeader>
                <CardTitle>Financial Summary</CardTitle>
                <p className="text-sm text-gray-600">Key financial metrics to date</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-600">Total Revenue</span>
                    <span className="font-mono font-bold text-gray-900">{formatCurrency(3850000)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-600">Total Costs</span>
                    <span className="font-mono font-bold text-gray-900">{formatCurrency(2850000)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-sm font-medium text-green-700">Gross Profit</span>
                    <span className="font-mono font-bold text-green-700">{formatCurrency(1000000)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-primary bg-opacity-10 rounded-lg border border-primary border-opacity-20">
                    <span className="text-sm font-medium text-primary">Economic Profit</span>
                    <span className="font-mono font-bold text-primary">{formatCurrency(850000)}</span>
                  </div>
                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Profit Margin</span>
                      <span className="font-mono font-bold text-gray-900">26.0%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="demand" className="space-y-6">
          {/* Demand vs Actual Sales */}
          <Card className="border border-gray-100">
            <CardHeader>
              <CardTitle>Demand Forecast vs Actual Performance</CardTitle>
              <p className="text-sm text-gray-600">Compare projected demand with actual sales results</p>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={demandForecastData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="week" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `${(value / 1000)}k`}
                    />
                    <Tooltip 
                      formatter={(value, name) => [value?.toLocaleString() || 'TBD', name]}
                      labelFormatter={(label) => `Week ${label}`}
                    />
                    <Bar dataKey="projected" fill="#94A3B8" name="Projected Demand" />
                    <Bar dataKey="actual" fill="#3B82F6" name="Actual Sales" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          {/* Product Performance */}
          <Card className="border border-gray-100">
            <CardHeader>
              <CardTitle>Product Performance Analysis</CardTitle>
              <p className="text-sm text-gray-600">Sales performance and margins by product</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {productPerformanceData.map((product) => (
                  <div key={product.product} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-gray-900">{product.product}</h3>
                      <Badge className={
                        product.margin >= 50 ? "bg-green-100 text-green-700" :
                        product.margin >= 40 ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }>
                        {product.margin}% margin
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Projected Demand</span>
                        <p className="font-mono font-semibold">{product.demand.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Units Sold</span>
                        <p className="font-mono font-semibold">{product.sales.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Fill Rate</span>
                        <p className="font-mono font-semibold">{((product.sales / product.demand) * 100).toFixed(1)}%</p>
                      </div>
                    </div>

                    {/* Progress bar for fill rate */}
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            (product.sales / product.demand) >= 0.95 ? "bg-green-500" :
                            (product.sales / product.demand) >= 0.85 ? "bg-yellow-500" :
                            "bg-red-500"
                          }`}
                          style={{ width: `${Math.min((product.sales / product.demand) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

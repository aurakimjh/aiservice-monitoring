'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, SearchInput, Tabs, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { KPICard } from '@/components/monitoring';
import { getMarketplaceItems } from '@/lib/demo-data';
import type { MarketplaceItemType } from '@/types/monitoring';
import {
  Store,
  Download,
  Star,
  Package,
  Search,
  Upload,
  LayoutDashboard,
  MessageSquare,
  Puzzle,
  BookOpen,
} from 'lucide-react';

const VIEW_TABS = [
  { id: 'browse', label: 'Browse', icon: <Search size={13} /> },
  { id: 'featured', label: 'Featured', icon: <Star size={13} /> },
  { id: 'publish', label: 'Publish', icon: <Upload size={13} /> },
];

const TYPE_COLORS: Record<MarketplaceItemType, string> = {
  dashboard: '#58A6FF',
  prompt: '#BC8CFF',
  plugin: '#3FB950',
  notebook: '#D29922',
};

const TYPE_ICONS: Record<MarketplaceItemType, React.ReactNode> = {
  dashboard: <LayoutDashboard size={12} />,
  prompt: <MessageSquare size={12} />,
  plugin: <Puzzle size={12} />,
  notebook: <BookOpen size={12} />,
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'prompt', label: 'Prompt' },
  { value: 'plugin', label: 'Plugin' },
  { value: 'notebook', label: 'Notebook' },
];

function ItemCard({ item }: { item: ReturnType<typeof getMarketplaceItems>[number] }) {
  return (
    <Card className="relative hover:border-[var(--accent-primary)] transition-colors">
      {item.featured && (
        <div className="absolute top-2 right-2">
          <Star size={14} className="text-[#D29922] fill-[#D29922]" />
        </div>
      )}
      <div className="space-y-2.5">
        {/* Type badge */}
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium rounded-[var(--radius-full)] px-2 py-0.5 border whitespace-nowrap"
          style={{
            backgroundColor: `${TYPE_COLORS[item.type]}20`,
            color: TYPE_COLORS[item.type],
            borderColor: `${TYPE_COLORS[item.type]}40`,
          }}
        >
          {TYPE_ICONS[item.type]}
          {item.type}
        </span>

        {/* Name & Description */}
        <div>
          <div className="text-sm font-semibold text-[var(--text-primary)]">{item.name}</div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{item.description}</p>
        </div>

        {/* Author & Stats */}
        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <span>{item.author}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Download size={11} className="text-[var(--text-muted)]" />
              {item.downloads.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Star size={11} className="text-[#D29922]" />
              {item.rating}
            </span>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[10px] rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function MarketplacePage() {
  const [activeTab, setActiveTab] = useState('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [publishName, setPublishName] = useState('');
  const [publishDesc, setPublishDesc] = useState('');
  const [publishType, setPublishType] = useState('dashboard');
  const [publishTags, setPublishTags] = useState('');

  const demoItems = useCallback(() => getMarketplaceItems(), []);
  const { data: itemsData, source } = useDataSource('/marketplace/items', demoItems, { refreshInterval: 30_000 });
  const items = itemsData ?? [];

  const filteredItems = useMemo(() => {
    let result = items;
    if (typeFilter !== 'all') {
      result = result.filter((item) => item.type === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [items, typeFilter, searchQuery]);

  const featuredItems = useMemo(() => items.filter((item) => item.featured), [items]);

  const dashboardCount = items.filter((i) => i.type === 'dashboard').length;
  const promptCount = items.filter((i) => i.type === 'prompt').length;
  const pluginCount = items.filter((i) => i.type === 'plugin').length;

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Marketplace', icon: <Store size={14} /> },
      ]} />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Global Marketplace</h1>
        <DataSourceBadge source={source} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard helpId="marketplace-total" title="Total Items" value={items.length} status="healthy" />
        <KPICard helpId="marketplace-dashboards" title="Dashboards" value={dashboardCount} subtitle={`${Math.round((dashboardCount / items.length) * 100)}% of total`} />
        <KPICard helpId="marketplace-prompts" title="Prompts" value={promptCount} subtitle={`${Math.round((promptCount / items.length) * 100)}% of total`} />
        <KPICard helpId="marketplace-plugins" title="Plugins" value={pluginCount} subtitle={`${Math.round((pluginCount / items.length) * 100)}% of total`} />
      </div>

      {/* Tabs */}
      <Tabs tabs={VIEW_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Browse Tab */}
      {activeTab === 'browse' && (
        <div className="space-y-3">
          {/* Search & Filter */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchInput
                placeholder="Search marketplace..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select
              options={FILTER_OPTIONS}
              value={typeFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTypeFilter(e.target.value)}
              aria-label="Filter by type"
            />
          </div>

          {/* Results */}
          {filteredItems.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <Package size={32} className="mx-auto text-[var(--text-muted)] mb-2" />
                <p className="text-sm text-[var(--text-muted)]">No items found matching your criteria.</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredItems.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Featured Tab */}
      {activeTab === 'featured' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Star size={16} className="text-[#D29922]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Staff Picks</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {featuredItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Publish Tab */}
      {activeTab === 'publish' && (
        <Card>
          <CardHeader>
            <CardTitle>Publish New Item</CardTitle>
          </CardHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Name</label>
              <input
                type="text"
                value={publishName}
                onChange={(e) => setPublishName(e.target.value)}
                placeholder="Enter item name"
                className={cn(
                  'w-full h-8 px-3 rounded-[var(--radius-md)]',
                  'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
                  'text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                  'focus:outline-none focus:border-[var(--accent-primary)]',
                )}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Description</label>
              <textarea
                value={publishDesc}
                onChange={(e) => setPublishDesc(e.target.value)}
                placeholder="Describe your item..."
                rows={3}
                className={cn(
                  'w-full px-3 py-2 rounded-[var(--radius-md)]',
                  'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
                  'text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                  'focus:outline-none focus:border-[var(--accent-primary)]',
                  'resize-none',
                )}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Type</label>
              <Select
                options={[
                  { value: 'dashboard', label: 'Dashboard' },
                  { value: 'prompt', label: 'Prompt' },
                  { value: 'plugin', label: 'Plugin' },
                  { value: 'notebook', label: 'Notebook' },
                ]}
                value={publishType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPublishType(e.target.value)}
                aria-label="Item type"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Tags</label>
              <input
                type="text"
                value={publishTags}
                onChange={(e) => setPublishTags(e.target.value)}
                placeholder="Comma-separated tags (e.g. monitoring, gpu, llm)"
                className={cn(
                  'w-full h-8 px-3 rounded-[var(--radius-md)]',
                  'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
                  'text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                  'focus:outline-none focus:border-[var(--accent-primary)]',
                )}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-[var(--text-muted)]">
                Published items will be reviewed before appearing in the marketplace.
              </p>
              <Button>
                <Upload size={13} className="mr-1.5" />
                Publish Item
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

import { renderHook, act } from '@testing-library/react';
import { useCrudList } from '@/hooks/useCrudList';

// ── Test data ────────────────────────────────────────────────────────

interface Item {
  id: string;
  name: string;
  category: string;
  value: number;
}

type SF = 'name' | 'category' | 'value';

const ITEMS: Item[] = [
  { id: '1', name: 'Apple', category: 'fruit', value: 3 },
  { id: '2', name: 'Banana', category: 'fruit', value: 1 },
  { id: '3', name: 'Carrot', category: 'vegetable', value: 2 },
  { id: '4', name: 'Daikon', category: 'vegetable', value: 5 },
  { id: '5', name: 'Eggplant', category: 'vegetable', value: 4 },
];

const defaultOpts = {
  items: ITEMS,
  defaultSortField: 'name' as SF,
  filterFn: (items: Item[], searchTerm: string) => {
    if (!searchTerm) return items;
    const q = searchTerm.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(q));
  },
  filterDeps: [] as unknown[],
  compareFn: (a: Item, b: Item, field: SF) => {
    switch (field) {
      case 'name': return a.name.localeCompare(b.name);
      case 'category': return a.category.localeCompare(b.category);
      case 'value': return a.value - b.value;
      default: return 0;
    }
  },
};

// ── Tests ────────────────────────────────────────────────────────────

describe('useCrudList', () => {
  describe('initial state', () => {
    it('returns all items sorted by default field (name asc)', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      expect(result.current.sorted.map(i => i.name)).toEqual([
        'Apple', 'Banana', 'Carrot', 'Daikon', 'Eggplant',
      ]);
    });

    it('defaults to page 1, pageSize 10, asc direction', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      expect(result.current.page).toBe(1);
      expect(result.current.pageSize).toBe(10);
      expect(result.current.sortDir).toBe('asc');
    });

    it('starts with empty search and selection', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      expect(result.current.searchTerm).toBe('');
      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.searchChip).toBeNull();
    });
  });

  describe('search', () => {
    it('filters items by search term', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      act(() => result.current.setSearchTerm('car'));
      expect(result.current.filtered.map(i => i.name)).toEqual(['Carrot']);
    });

    it('generates a searchChip when searching', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      act(() => result.current.setSearchTerm('apple'));
      expect(result.current.searchChip).not.toBeNull();
      expect(result.current.searchChip?.label).toBe('"apple"');
    });

    it('clears search via searchChip.clear()', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      act(() => result.current.setSearchTerm('test'));
      expect(result.current.searchTerm).toBe('test');
      act(() => result.current.searchChip!.clear());
      expect(result.current.searchTerm).toBe('');
    });
  });

  describe('sorting', () => {
    it('toggles sort field', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      act(() => result.current.toggleSort('value'));
      expect(result.current.sortField).toBe('value');
      expect(result.current.sortDir).toBe('asc');
      expect(result.current.sorted.map(i => i.value)).toEqual([1, 2, 3, 4, 5]);
    });

    it('toggles sort direction on same field', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      act(() => result.current.toggleSort('value'));
      act(() => result.current.toggleSort('value'));
      expect(result.current.sortDir).toBe('desc');
      expect(result.current.sorted.map(i => i.value)).toEqual([5, 4, 3, 2, 1]);
    });

    it('provides sortProps for SortableHeader', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      expect(result.current.sortProps).toEqual({
        sortField: 'name',
        sortDir: 'asc',
        onSort: expect.any(Function),
      });
    });
  });

  describe('pagination', () => {
    it('paginates correctly with small page size', () => {
      const { result } = renderHook(() =>
        useCrudList<Item, SF>({ ...defaultOpts, defaultPageSize: 2 }),
      );
      expect(result.current.paginated).toHaveLength(2);
      expect(result.current.totalPages).toBe(3);
      expect(result.current.paginated.map(i => i.name)).toEqual(['Apple', 'Banana']);
    });

    it('navigates to page 2', () => {
      const { result } = renderHook(() =>
        useCrudList<Item, SF>({ ...defaultOpts, defaultPageSize: 2 }),
      );
      act(() => result.current.setPage(2));
      expect(result.current.paginated.map(i => i.name)).toEqual(['Carrot', 'Daikon']);
    });

    it('changes page size', () => {
      const { result } = renderHook(() =>
        useCrudList<Item, SF>({ ...defaultOpts, defaultPageSize: 2 }),
      );
      act(() => result.current.setPageSize(3));
      expect(result.current.totalPages).toBe(2);
      expect(result.current.paginated).toHaveLength(3);
    });

    it('resets page to 1 when search changes', () => {
      const { result } = renderHook(() =>
        useCrudList<Item, SF>({ ...defaultOpts, defaultPageSize: 2 }),
      );
      act(() => result.current.setPage(2));
      expect(result.current.page).toBe(2);
      act(() => result.current.setSearchTerm('a'));
      expect(result.current.page).toBe(1);
    });

    it('resets page to 1 when sort changes', () => {
      const { result } = renderHook(() =>
        useCrudList<Item, SF>({ ...defaultOpts, defaultPageSize: 2 }),
      );
      act(() => result.current.setPage(2));
      act(() => result.current.toggleSort('value'));
      expect(result.current.page).toBe(1);
    });
  });

  describe('selection', () => {
    it('toggleSelect adds and removes items', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      act(() => result.current.toggleSelect('1'));
      expect(result.current.selectedIds.has('1')).toBe(true);
      act(() => result.current.toggleSelect('1'));
      expect(result.current.selectedIds.has('1')).toBe(false);
    });

    it('toggleSelectAll selects/deselects all on page', () => {
      const { result } = renderHook(() =>
        useCrudList<Item, SF>({ ...defaultOpts, defaultPageSize: 2 }),
      );
      act(() => result.current.toggleSelectAll());
      expect(result.current.selectedIds.size).toBe(2);
      expect(result.current.allOnPageSelected).toBe(true);
      // Deselect all
      act(() => result.current.toggleSelectAll());
      expect(result.current.selectedIds.size).toBe(0);
    });

    it('someOnPageSelected is true when subset selected', () => {
      const { result } = renderHook(() =>
        useCrudList<Item, SF>({ ...defaultOpts, defaultPageSize: 3 }),
      );
      act(() => result.current.toggleSelect('1'));
      expect(result.current.someOnPageSelected).toBe(true);
      expect(result.current.allOnPageSelected).toBe(false);
    });

    it('clearSelection empties the set', () => {
      const { result } = renderHook(() => useCrudList<Item, SF>(defaultOpts));
      act(() => result.current.toggleSelect('1'));
      act(() => result.current.toggleSelect('2'));
      expect(result.current.selectedIds.size).toBe(2);
      act(() => result.current.clearSelection());
      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('custom defaults', () => {
    it('respects defaultSortDir', () => {
      const { result } = renderHook(() =>
        useCrudList<Item, SF>({ ...defaultOpts, defaultSortDir: 'desc' }),
      );
      expect(result.current.sortDir).toBe('desc');
      expect(result.current.sorted[0].name).toBe('Eggplant');
    });
  });
});

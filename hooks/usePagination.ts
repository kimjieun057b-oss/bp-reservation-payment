"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';

interface UsePaginationOptions {
  initialPage?: number;
  resetOnDataChange?: boolean;
  onPageChange?: (page: number) => void;
}

export function usePagination<T>(
  data: T[],
  dataPerPage: number,
  options: UsePaginationOptions = {}
) {
  const { initialPage = 1, resetOnDataChange = true, onPageChange: onChange } = options;
  const [currentPage, setCurrentPage] = useState(initialPage);

  useEffect(() => {
    if (resetOnDataChange) setCurrentPage(initialPage);
  }, [data, initialPage, resetOnDataChange]);

  const totalCount = data.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / dataPerPage));

  const currentItems = useMemo(() => {
    const startIndex = (currentPage - 1) * dataPerPage;
    return data.slice(startIndex, startIndex + dataPerPage);
  }, [currentPage, data, dataPerPage]);

  const onPageChange = useCallback(
    (page: number) => {
      const nextPage = Math.max(1, Math.min(totalPages, page));
      if (nextPage === currentPage) return;
      setCurrentPage(nextPage);
      onChange?.(nextPage);
    },
    [currentPage, onChange, totalPages]
  );

  return {
    currentPage,
    currentItems,
    totalCount,
    totalPages,
    onPageChange,
    setCurrentPage,
  };
}

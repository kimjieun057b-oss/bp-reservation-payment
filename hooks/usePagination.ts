"use client";
import { useCallback, useMemo, useState } from 'react';

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

  // data 또는 initialPage가 바뀌면(필터/재조회로 배열이 새로 만들어질 때) 페이지를 초기화한다.
  // effect 대신 렌더 중 조건부 setState로 처리해 한 프레임 늦게 반영되는 것을 피한다
  // (React 공식 가이드의 "prop이 바뀔 때 state를 조정하는" 패턴).
  const [prevDeps, setPrevDeps] = useState({ data, initialPage });
  if (resetOnDataChange && (data !== prevDeps.data || initialPage !== prevDeps.initialPage)) {
    setPrevDeps({ data, initialPage });
    setCurrentPage(initialPage);
  }

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

import { useState } from "react";

interface IPaginationProps {
  totalCount: number;
  itemsPerPage: number;
  pagesPerGroup?: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  totalCount,
  itemsPerPage,
  pagesPerGroup = 5,
  onPageChange,
}: IPaginationProps) {

  const pageCount = Math.ceil(totalCount / itemsPerPage);
  const [currentPage, setCurrentPage] = useState(1);
  const [groupStart, setGroupStart] = useState(1);

  const pages = Array.from(
    { length: pagesPerGroup },
    (_, i) => i + groupStart
  ).filter((page) => page <= pageCount);

  const handlePageClick = (page: number) => {
    setCurrentPage(page);
    onPageChange(page);
  };

  const handlePrev = () => {
    if (currentPage <= 1) return;
    const newPage = currentPage - 1;
    if (newPage < groupStart) setGroupStart(groupStart - pagesPerGroup);
    handlePageClick(newPage);
  };

  const handleNext = () => {
    if (currentPage >= pageCount) return;
    const newPage = currentPage + 1;
    if (newPage >= groupStart + pagesPerGroup) setGroupStart(groupStart + pagesPerGroup);
    handlePageClick(newPage);
  };

  return (
    <div className="flex items-center justify-center gap-1 mt-8">
      <button
        onClick={handlePrev}
        disabled={currentPage <= 1}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-body hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        ‹
      </button>

      {pages.map((page) => (
        <button
          key={page}
          onClick={() => handlePageClick(page)}
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            currentPage === page
              ? "bg-primary text-white"
              : "text-body hover:bg-surface"
          }`}
        >
          {page}
        </button>
      ))}

      <button
        onClick={handleNext}
        disabled={currentPage >= pageCount}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-body hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        ›
      </button>
    </div>
  );
}

interface SkeletonProps {
    className : string
}

export default function Skeleton ({className} : SkeletonProps) {
    return (
        <section
            className={`${className} my-3 mx-0 bg-gray-200/60 animate-pulse speed-faster flex flex-col justify-between p-6`}>
        </section>
    )
}
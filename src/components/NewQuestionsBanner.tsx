import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";

interface Props {
    count: number;
    onRefresh: () => void;
}

export default function NewQuestionsBanner({ count, onRefresh }: Props) {
    return (
        <AnimatePresence>
            {count > 0 && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                >
                    <button
                        onClick={onRefresh}
                        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 py-2.5 text-sm font-medium text-[#a7c8b3] transition hover:bg-[#a7c8b3]/20"
                    >
                        <ArrowUp className="size-4" />
                        {count} new question{count > 1 ? "s" : ""}
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

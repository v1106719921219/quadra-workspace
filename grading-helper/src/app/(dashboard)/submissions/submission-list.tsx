"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createSubmission } from "@/actions/submissions";
import { format } from "date-fns";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "作成中", variant: "secondary" },
  submitted: { label: "提出済", variant: "default" },
  returned: { label: "返却済", variant: "outline" },
};

interface Submission {
  id: string;
  title: string;
  status: string;
  grading_company_id: string;
  grading_companies: { name: string } | null;
  submission_items: { count: number }[];
  created_at: string;
  submitted_at: string | null;
}

interface SubmissionListProps {
  submissions: Submission[];
}

export function SubmissionList({ submissions }: SubmissionListProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("psa");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }

    setCreating(true);
    try {
      const submission = await createSubmission({
        gradingCompanyId: companyId,
        title: title.trim(),
      });
      toast.success("提出リストを作成しました");
      setOpen(false);
      setTitle("");
      router.push(`/submissions/${submission.id}`);
    } catch (error) {
      toast.error(
        `作成エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新規作成
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新規提出リスト</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>タイトル</Label>
                <Input
                  placeholder="例: PSA 2024年3月提出"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
              <div className="space-y-2">
                <Label>グレーディング会社</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="psa">PSA</SelectItem>
                    <SelectItem value="cgc">CGC</SelectItem>
                    <SelectItem value="bgs">BGS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="w-full"
              >
                {creating ? "作成中..." : "作成"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タイトル</TableHead>
              <TableHead className="w-24">会社</TableHead>
              <TableHead className="w-20">ステータス</TableHead>
              <TableHead className="w-16">枚数</TableHead>
              <TableHead className="w-32">作成日</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-8"
                >
                  提出リストがありません
                </TableCell>
              </TableRow>
            ) : (
              submissions.map((sub) => {
                const status = STATUS_MAP[sub.status] ?? STATUS_MAP.draft;
                const itemCount = sub.submission_items?.[0]?.count ?? 0;
                return (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <Link
                        href={`/submissions/${sub.id}`}
                        className="font-medium hover:underline"
                      >
                        {sub.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {sub.grading_company_id.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>{itemCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(sub.created_at), "yyyy/MM/dd")}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/submissions/${sub.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

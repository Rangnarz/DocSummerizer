'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileText,
  File,
  Trash2,
  Sparkles,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageCircle,
  Volume2,
  VolumeX,
  Download,
  BookOpen,
  FileSpreadsheet,
  FileTextIcon,
  FolderOpen,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface Document {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  content: string;
  summary: string | null;
  summaryMode: string;
  summaryLength: string;
  status: string;
  folderId: string | null;
  tags: { id: string; name: string; color: string }[];
  createdAt: string;
  updatedAt: string;
}

interface Folder {
  id: string;
  name: string;
  color: string;
}

interface ChatMessage {
  id: string;
  documentId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

type SummaryMode = 'study' | 'report' | 'general';
type SummaryLength = 'short' | 'medium' | 'detailed';

const MODE_CONFIG = {
  study: {
    label: 'Study Mode',
    description: 'Core concepts, terminologies, Q&A flashcards',
    icon: BookOpen,
    color: 'text-green-500',
  },
  report: {
    label: 'Report Mode',
    description: 'Key findings, metrics, recommendations',
    icon: FileSpreadsheet,
    color: 'text-blue-500',
  },
  general: {
    label: 'General Mode',
    description: '5W1H analysis, executive overview',
    icon: FileTextIcon,
    color: 'text-purple-500',
  },
};

const LENGTH_CONFIG = {
  short: { label: 'Short', description: '~150 words' },
  medium: { label: 'Medium', description: '~300 words' },
  detailed: { label: 'Detailed', description: '~500 words' },
};

export default function DocumentSummarizer() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('general');
  const [summaryLength, setSummaryLength] = useState<SummaryLength>('medium');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await fetch('/api/documents');
      const data = await response.json();
      if (!response.ok) {
        console.error('Failed to fetch documents:', data.error);
        toast.error('โหลดเอกสารล้มเหลว', { description: data.error || 'ลองรีเฟรชหน้า' });
        return;
      }
      setDocuments(data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      toast.error('โหลดเอกสารล้มเหลว', { description: 'ตรวจสอบการเชื่อมต่อ' });
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch('/api/folders');
      if (response.ok) {
        const data = await response.json();
        setFolders(data);
      }
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchFolders();
  }, [fetchDocuments, fetchFolders]);

  useEffect(() => {
    if (selectedDoc) {
      fetchChatMessages(selectedDoc.id);
    }
  }, [selectedDoc?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchChatMessages = async (docId: string) => {
    try {
      const response = await fetch(`/api/documents/${docId}/chat`);
      if (response.ok) {
        const data = await response.json();
        setChatMessages(data);
      }
    } catch (error) {
      console.error('Failed to fetch chat messages:', error);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await uploadFile(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const uploadFile = async (file: File) => {
    // Validate file by extension (most reliable)
    const fileName = file.name.toLowerCase();
    const ext = fileName.split('.').pop() || '';
    const validExtensions = ['pdf', 'docx', 'txt'];

    if (!validExtensions.includes(ext)) {
      toast.error('ประเภทไฟล์ไม่ถูกต้อง', {
        description: 'กรุณาอัปโหลดไฟล์ PDF, DOCX หรือ TXT',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('ไฟล์ใหญ่เกินไป', {
        description: 'ขนาดไฟล์สูงสุดคือ 10MB',
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setDocuments((prev) => [data, ...prev]);
      setSelectedDoc(data);
      toast.success('อัปโหลดสำเร็จ', {
        description: `${file.name} อัปโหลดเรียบร้อยแล้ว`,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('อัปโหลดล้มเหลว', {
        description: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const summarizeDocument = async (doc: Document) => {
    setIsSummarizing(true);

    try {
      const response = await fetch(`/api/documents/${doc.id}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: summaryMode, length: summaryLength }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Summarization failed');
      }

      setDocuments((prev) => prev.map((d) => (d.id === data.id ? data : d)));
      setSelectedDoc(data);
      toast.success('สร้างสรุปสำเร็จ');
    } catch (error) {
      toast.error('สร้างสรุปล้มเหลว', {
        description: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setIsSummarizing(false);
    }
  };

  const deleteDocument = async (doc: Document) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });

      if (!response.ok) throw new Error('Delete failed');

      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      if (selectedDoc?.id === doc.id) {
        setSelectedDoc(null);
        setChatMessages([]);
      }
      toast.success('ลบเอกสารสำเร็จ');
    } catch {
      toast.error('ลบเอกสารล้มเหลว');
    }
  };

  const copySummary = async () => {
    if (selectedDoc?.summary) {
      await navigator.clipboard.writeText(selectedDoc.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('คัดลอกแล้ว');
    }
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !selectedDoc || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setIsChatLoading(true);

    const tempMsg: ChatMessage = {
      id: 'temp',
      documentId: selectedDoc.id,
      role: 'user',
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, tempMsg]);

    try {
      const response = await fetch(`/api/documents/${selectedDoc.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      setChatMessages((prev) => prev.filter((m) => m.id !== 'temp'));
      setChatMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
    } catch (err) {
      setChatMessages((prev) => prev.filter((m) => m.id !== 'temp'));
      setChatInput(userMessage); // Restore input so user doesn't lose their question
      toast.error('ส่งข้อความล้มเหลว', {
        description: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleTTS = () => {
    if (!selectedDoc?.summary) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(selectedDoc.summary);
    utterance.lang = 'th-TH';
    utterance.onend = () => setIsPlaying(false);
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  };

  const exportDocument = async (format: 'pdf' | 'docx') => {
    if (!selectedDoc) return;

    try {
      const response = await fetch(`/api/documents/${selectedDoc.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Server always returns Markdown — use .md extension regardless of requested format
      a.download = `${selectedDoc.filename.replace(/\.[^/.]+$/, '')}_summary.md`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setShowExportDialog(false);
      toast.success('ส่งออกสรุปเป็น Markdown สำเร็จ');
    } catch {
      toast.error('ส่งออกล้มเหลว');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive'; icon: React.ReactNode; label: string }> = {
      uploaded: { variant: 'secondary', icon: <Clock className="w-3 h-3" />, label: 'พร้อม' },
      processing: { variant: 'default', icon: <Loader2 className="w-3 h-3 animate-spin" />, label: 'กำลังประมวลผล' },
      summarized: { variant: 'default', icon: <CheckCircle2 className="w-3 h-3" />, label: 'สรุปแล้ว' },
      error: { variant: 'destructive', icon: <AlertCircle className="w-3 h-3" />, label: 'ผิดพลาด' },
    };
    const c = config[status] || config.uploaded;
    return <Badge variant={c.variant} className="gap-1">{c.icon}{c.label}</Badge>;
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf': return <FileText className="w-5 h-5 text-red-500" />;
      case 'docx': return <FileText className="w-5 h-5 text-blue-500" />;
      default: return <File className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Briefly</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">สรุปเอกสารอัจฉริยะด้วย AI</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <FolderOpen className="w-3 h-3" />
                {folders.length} Folders
              </Badge>
              <Badge variant="outline" className="gap-1">
                <File className="w-3 h-3" />
                {documents.length} Documents
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex-1">
        {/* Upload Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Card
            className={`border-2 border-dashed transition-all duration-300 ${
              isDragging ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20' : 'hover:border-violet-400'
            }`}
          >
            <CardContent className="p-8">
              <div
                className="flex flex-col items-center justify-center text-center"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <motion.div
                  animate={isDragging ? { scale: 1.1 } : { scale: 1 }}
                  className={`mb-4 p-4 rounded-full ${isDragging ? 'bg-violet-100 dark:bg-violet-900/30' : 'bg-slate-100 dark:bg-slate-800'}`}
                >
                  <Upload className={`w-8 h-8 ${isDragging ? 'text-violet-500' : 'text-slate-400'}`} />
                </motion.div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  อัปโหลดเอกสารของคุณ
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                  ลากและวาง หรือคลิกเพื่อเลือกไฟล์
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                  รองรับไฟล์ PDF, DOCX และ TXT ขนาดไม่เกิน 10MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <Button
                  asChild
                  disabled={isUploading}
                  className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                >
                  <label htmlFor="file-upload" className="cursor-pointer">
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        กำลังอัปโหลด...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        เลือกไฟล์
                      </>
                    )}
                  </label>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Documents List */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-violet-500" />
                  เอกสารของคุณ
                </CardTitle>
                <CardDescription>{documents.length} เอกสาร</CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <File className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>ยังไม่มีเอกสาร</p>
                    <p className="text-sm">อัปโหลดเอกสารเพื่อเริ่มต้น</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      <AnimatePresence mode="popLayout">
                        {documents.map((doc) => (
                          <motion.div
                            key={doc.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            layout
                          >
                            <Card
                              className={`cursor-pointer transition-all hover:shadow-md ${
                                selectedDoc?.id === doc.id ? 'ring-2 ring-violet-500' : ''
                              }`}
                              onClick={() => setSelectedDoc(doc)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                                    {getFileIcon(doc.fileType)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-sm truncate">{doc.filename}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-xs text-slate-500">{formatFileSize(doc.fileSize)}</span>
                                      {getStatusBadge(doc.status)}
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-400 hover:text-red-500"
                                    onClick={(e) => { e.stopPropagation(); deleteDocument(doc); }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Summary & Chat Panel */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-violet-500" />
                      {selectedDoc ? selectedDoc.filename : 'เลือกเอกสาร'}
                    </CardTitle>
                    <CardDescription>
                      {selectedDoc ? 'สรุปเอกสารและแชทกับ AI' : 'เลือกเอกสารจากรายการ'}
                    </CardDescription>
                  </div>
                  {selectedDoc?.summary && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={copySummary}>
                        {copied ? <><Check className="w-4 h-4 mr-1" />คัดลอกแล้ว</> : <><Copy className="w-4 h-4 mr-1" />คัดลอก</>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleTTS}>
                        {isPlaying ? <><VolumeX className="w-4 h-4 mr-1" />หยุด</> : <><Volume2 className="w-4 h-4 mr-1" />อ่านออกเสียง</>}
                      </Button>
                      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Download className="w-4 h-4 mr-1" />ส่งออก
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>ส่งออกสรุป</DialogTitle>
                            <DialogDescription>เลือกรูปแบบไฟล์ที่ต้องการ</DialogDescription>
                          </DialogHeader>
                          <div className="grid grid-cols-2 gap-4 py-4">
                            <Button variant="outline" className="h-24 flex-col" onClick={() => exportDocument('pdf')}>
                              <FileText className="w-8 h-8 mb-2 text-red-500" />PDF
                            </Button>
                            <Button variant="outline" className="h-24 flex-col" onClick={() => exportDocument('docx')}>
                              <FileText className="w-8 h-8 mb-2 text-blue-500" />Word (DOCX)
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedDoc ? (
                  <div className="text-center py-12 text-slate-500">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>ยังไม่ได้เลือกเอกสาร</p>
                    <p className="text-sm">เลือกเอกสารจากรายการด้านซ้าย</p>
                  </div>
                ) : (
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="summary">สรุปเอกสาร</TabsTrigger>
                      <TabsTrigger value="chat" className="gap-1">
                        <MessageCircle className="w-4 h-4" />แชทกับเอกสาร
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="summary" className="mt-4 space-y-4">
                      {/* Mode Selection */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>โหมดสรุป</Label>
                          <Select value={summaryMode} onValueChange={(v) => setSummaryMode(v as SummaryMode)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(MODE_CONFIG).map(([key, config]) => {
                                const Icon = config.icon;
                                return (
                                  <SelectItem key={key} value={key}>
                                    <div className="flex items-center gap-2">
                                      <Icon className={`w-4 h-4 ${config.color}`} />
                                      <div>
                                        <div className="font-medium">{config.label}</div>
                                        <div className="text-xs text-muted-foreground">{config.description}</div>
                                      </div>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>ความยาวสรุป</Label>
                          <Select value={summaryLength} onValueChange={(v) => setSummaryLength(v as SummaryLength)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(LENGTH_CONFIG).map(([key, config]) => (
                                <SelectItem key={key} value={key}>
                                  <div>
                                    <div className="font-medium">{config.label}</div>
                                    <div className="text-xs text-muted-foreground">{config.description}</div>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Document Info */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-3">
                          {getFileIcon(selectedDoc.fileType)}
                          <div>
                            <p className="font-medium text-sm">{selectedDoc.filename}</p>
                            <p className="text-xs text-slate-500">{formatFileSize(selectedDoc.fileSize)} • {selectedDoc.fileType.toUpperCase()}</p>
                          </div>
                        </div>
                        {getStatusBadge(selectedDoc.status)}
                      </div>

                      {/* Summary Content */}
                      {selectedDoc.status === 'summarized' && selectedDoc.summary ? (
                        <div className="space-y-4">
                          <ScrollArea className="h-[300px] rounded-lg border p-4 bg-slate-50 dark:bg-slate-800/30">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown>{selectedDoc.summary}</ReactMarkdown>
                            </div>
                          </ScrollArea>
                          <Button variant="outline" size="sm" onClick={() => summarizeDocument(selectedDoc)} disabled={isSummarizing}>
                            {isSummarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          </Button>
                        </div>
                      ) : selectedDoc.status === 'processing' ? (
                        <div className="text-center py-8">
                          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-violet-500" />
                          <p>กำลังสร้างสรุป...</p>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Sparkles className="w-12 h-12 mx-auto mb-4 text-violet-300" />
                          <p className="mb-4">พร้อมสร้างสรุป</p>
                          <p className="text-sm text-slate-500 mb-4">
                            โหมด: {MODE_CONFIG[summaryMode].label} | ความยาว: {LENGTH_CONFIG[summaryLength].label}
                          </p>
                          <Button
                            onClick={() => summarizeDocument(selectedDoc)}
                            disabled={isSummarizing}
                            className="bg-gradient-to-r from-violet-500 to-purple-600"
                          >
                            {isSummarizing ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />กำลังสรุป...</>
                            ) : (
                              <><Sparkles className="w-4 h-4 mr-2" />สร้างสรุป</>
                            )}
                          </Button>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="chat" className="mt-4">
                      <div className="flex flex-col h-[400px]">
                        <ScrollArea className="flex-1 pr-4">
                          {chatMessages.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                              <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p>เริ่มถามคำถามเกี่ยวกับเอกสาร</p>
                              <p className="text-sm">เช่น "ประเด็นหลักคืออะไร?"</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {chatMessages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[80%] rounded-lg p-3 ${msg.role === 'user' ? 'bg-violet-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              <div ref={chatEndRef} />
                            </div>
                          )}
                        </ScrollArea>
                        <div className="flex gap-2 mt-4 pt-4 border-t">
                          <Input
                            placeholder="ถามคำถามเกี่ยวกับเอกสาร..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
                            disabled={isChatLoading}
                          />
                          <Button onClick={sendMessage} disabled={!chatInput.trim() || isChatLoading} className="bg-gradient-to-r from-violet-500 to-purple-600">
                            {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="container mx-auto px-4 py-4">
          <p className="text-center text-sm text-slate-500">
            Powered by AI • Briefly - สรุปเอกสารอัจฉริยะ
          </p>
        </div>
      </footer>
    </div>
  );
}

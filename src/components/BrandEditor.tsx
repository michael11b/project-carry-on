import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Brand = Tables<"brands">;

interface ColorsJson {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

interface FontsJson {
  heading: string;
  body: string;
}

interface VoiceProfileJson {
  tone: string;
  styleGuide: string;
  exampleContent: string;
}

const DEFAULT_COLORS: ColorsJson = { primary: "#6366f1", secondary: "#8b5cf6", accent: "#f59e0b", background: "#ffffff", text: "#1f2937" };
const DEFAULT_FONTS: FontsJson = { heading: "", body: "" };
const DEFAULT_VOICE: VoiceProfileJson = { tone: "Professional", styleGuide: "", exampleContent: "" };
const TONES = ["Professional", "Casual", "Playful", "Bold", "Minimal"];

interface BrandEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: Brand | null;
  orgId: string;
  workspaceId: string;
  onSaved: () => void;
}

export default function BrandEditor({ open, onOpenChange, brand, orgId, workspaceId, onSaved }: BrandEditorProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [colors, setColors] = useState<ColorsJson>(DEFAULT_COLORS);
  const [fonts, setFonts] = useState<FontsJson>(DEFAULT_FONTS);
  const [voice, setVoice] = useState<VoiceProfileJson>(DEFAULT_VOICE);
  const [prohibitedTerms, setProhibitedTerms] = useState("");

  useEffect(() => {
    if (brand) {
      setName(brand.name);
      setLogoUrl(brand.logo_url);
      setColors((brand.colors as unknown as ColorsJson) ?? DEFAULT_COLORS);
      setFonts((brand.fonts as unknown as FontsJson) ?? DEFAULT_FONTS);
      setVoice((brand.voice_profile as unknown as VoiceProfileJson) ?? DEFAULT_VOICE);
      setProhibitedTerms((brand.prohibited_terms ?? []).join(", "));
    } else {
      setName("");
      setLogoUrl(null);
      setColors(DEFAULT_COLORS);
      setFonts(DEFAULT_FONTS);
      setVoice(DEFAULT_VOICE);
      setProhibitedTerms("");
    }
  }, [brand, open]);

  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("brand-logos").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("brand-logos").getPublicUrl(path);
    setLogoUrl(urlData.publicUrl);
    setUploading(false);
  }, [orgId, toast]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Brand name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const terms = prohibitedTerms.split(",").map((t) => t.trim()).filter(Boolean);
    const payload = {
      name: name.trim(),
      logo_url: logoUrl,
      colors: colors as Record<string, unknown>,
      fonts: fonts as Record<string, unknown>,
      voice_profile: voice as Record<string, unknown>,
      prohibited_terms: terms,
      org_id: orgId,
      workspace_id: workspaceId,
    };

    const { error } = brand
      ? await supabase.from("brands").update(payload).eq("id", brand.id)
      : await supabase.from("brands").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: brand ? "Brand updated" : "Brand created" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{brand ? "Edit Brand" : "Create Brand"}</DialogTitle>
          <DialogDescription>Configure your brand identity, colors, fonts, and voice profile.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] px-6">
          <div className="space-y-6 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>Brand Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Corp" />
            </div>

            {/* Logo */}
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <div className="relative h-16 w-16 rounded-lg border bg-muted overflow-hidden">
                    <img src={logoUrl} alt="Brand logo" className="h-full w-full object-contain" />
                    <button onClick={() => setLogoUrl(null)} className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-destructive-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted hover:border-muted-foreground/50 transition-colors">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
                  </label>
                )}
                <span className="text-sm text-muted-foreground">Upload your brand logo (PNG, SVG, or JPG)</span>
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-2">
              <Label>Color Palette</Label>
              <div className="grid grid-cols-5 gap-3">
                {(Object.keys(DEFAULT_COLORS) as (keyof ColorsJson)[]).map((key) => (
                  <div key={key} className="space-y-1.5">
                    <label className="text-xs text-muted-foreground capitalize">{key}</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={colors[key]}
                        onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
                        className="h-8 w-8 rounded border cursor-pointer"
                      />
                      <Input
                        value={colors[key]}
                        onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fonts */}
            <div className="space-y-2">
              <Label>Typography</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Heading Font</label>
                  <Input value={fonts.heading} onChange={(e) => setFonts((f) => ({ ...f, heading: e.target.value }))} placeholder="e.g. Playfair Display" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Body Font</label>
                  <Input value={fonts.body} onChange={(e) => setFonts((f) => ({ ...f, body: e.target.value }))} placeholder="e.g. Inter" />
                </div>
              </div>
            </div>

            {/* Voice Profile */}
            <div className="space-y-2">
              <Label>Brand Voice</Label>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Tone</label>
                  <Select value={voice.tone} onValueChange={(v) => setVoice((vp) => ({ ...vp, tone: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Style Guide</label>
                  <Textarea value={voice.styleGuide} onChange={(e) => setVoice((vp) => ({ ...vp, styleGuide: e.target.value }))} placeholder="Describe your brand's writing style, do's and don'ts..." rows={3} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Example Content</label>
                  <Textarea value={voice.exampleContent} onChange={(e) => setVoice((vp) => ({ ...vp, exampleContent: e.target.value }))} placeholder="Paste an example of content that represents your brand voice..." rows={3} />
                </div>
              </div>
            </div>

            {/* Prohibited Terms */}
            <div className="space-y-2">
              <Label>Prohibited Terms</Label>
              <Input value={prohibitedTerms} onChange={(e) => setProhibitedTerms(e.target.value)} placeholder="e.g. cheap, discount, free (comma-separated)" />
              <p className="text-xs text-muted-foreground">These words will be excluded from AI-generated content.</p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 pt-0 flex-row justify-between sm:justify-between">
          {brand ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Delete Brand
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{brand.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone. All brand settings, colors, and voice profile data will be permanently removed.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      setDeleting(true);
                      const { error } = await supabase.from("brands").delete().eq("id", brand.id);
                      setDeleting(false);
                      if (error) {
                        toast({ title: "Delete failed", description: error.message, variant: "destructive" });
                        return;
                      }
                      toast({ title: "Brand deleted" });
                      onSaved();
                      onOpenChange(false);
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {brand ? "Save Changes" : "Create Brand"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

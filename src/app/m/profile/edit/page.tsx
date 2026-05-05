"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TopBar,
  Avatar,
  Input,
  TextArea,
  Button,
  IconCamera,
} from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

export default function EditProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    city: "",
    bio: "",
    email: "",
  });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const meta = (u.user_metadata || {}) as Record<string, string>;
      setForm({
        fullName: meta.full_name || meta.name || "",
        phone: meta.phone || "",
        city: meta.city || "",
        bio: meta.bio || "",
        email: u.email || "",
      });
    });
  }, []);

  async function save() {
    setLoading(true);
    setSaved(false);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: form.fullName,
        phone: form.phone,
        city: form.city,
        bio: form.bio,
      },
    });
    setLoading(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => router.push("/m/profile"), 800);
    }
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Edit profile" back="/m/profile" />
      <div className="flex flex-col items-center pt-2">
        <div className="relative">
          <Avatar size={96} name={form.fullName || "?"} />
          <button
            type="button"
            className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-primary text-white shadow-card"
            aria-label="Change photo"
          >
            <IconCamera />
          </button>
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-4 px-5">
        <Input
          label="Full name"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <Input label="Email" value={form.email} disabled hint="Contact support to change your email" />
        <Input
          label="Phone"
          inputMode="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <Input
          label="City"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <TextArea
          label="About me"
          rows={5}
          placeholder="Tell families about your experience and approach to care."
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button block onClick={save} disabled={loading}>
          {loading ? "Saving…" : saved ? "Saved" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

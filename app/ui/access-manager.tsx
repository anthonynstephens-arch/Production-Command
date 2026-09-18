"use client";
import { KeyRound, Mail, Save, Users, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

type User = {
  id: string;
  display_name: string;
  email: string | null;
  role: "admin" | "partner";
  must_change_pin: boolean;
  last_login: string | null;
  login_count: number;
};

export default function AccessManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("partner");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email: newEmail, pin, role }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add user.");
      setName("");
      setNewEmail("");
      setPin("");
      setAdding(false);
      setMessage(
        "User added and automatically enrolled in email notifications.",
      );
      await load();
      window.dispatchEvent(new Event("portal-users-updated"));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add user.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function load() {
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load users.");
      setUsers(body.users ?? []);
      setSelected((current) => current || body.users?.[0]?.id || "");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load users.",
      );
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const user = users.find((item) => item.id === selected);
    setEmail(user?.email ?? "");
    setPassword("");
  }, [selected, users]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: selected, email, password }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not update access.");
      setMessage("Email sign-in updated.");
      setPassword("");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update access.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section id="portal-users" className="panel access-panel">
      <div className="access-heading">
        <div className="icon-box">
          <Users size={20} />
        </div>
        <div>
          <p className="eyebrow">ADMIN ACCESS</p>
          <h2>Portal users</h2>
          <p>Add users with personal PIN access or enable email sign-in.</p>
        </div>
        <button
          type="button"
          className="sync-button add-user-button"
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          <UserPlus size={16} />
          {adding ? "Cancel" : "Add user with PIN"}
        </button>
      </div>
      {adding && (
        <form className="access-form create-user-form" onSubmit={create}>
          <label>
            <span>Full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={100}
              autoComplete="name"
              required
            />
          </label>
          <label>
            <span>Access level</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="partner">Marsh partner</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <label>
            <span>Email address</span>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
              placeholder="name@example.com"
              required
            />
          </label>
          <label>
            <span>Temporary PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4,8}"
              minLength={4}
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="4–8 digits"
              required
            />
          </label>
          <button className="sync-button" disabled={saving}>
            <UserPlus size={16} />
            {saving ? "Adding…" : "Create user"}
          </button>
          <small>
            New users are automatically enrolled in email notifications and
            must choose a new PIN at first sign-in.
          </small>
        </form>
      )}
      <div className="user-strip">
        {users.map((user) => (
          <button
            type="button"
            key={user.id}
            className={selected === user.id ? "selected" : ""}
            onClick={() => setSelected(user.id)}
          >
            <strong>{user.display_name}</strong>
            <span>
              {user.role === "admin" ? "Admin" : "Marsh"} ·{" "}
              {user.email ?? "PIN only"}
            </span>
            <span>
              Total logins: {(user.login_count ?? 0).toLocaleString()}
            </span>
            <span>
              Last login:{" "}
              {user.last_login
                ? new Date(user.last_login).toLocaleString("en-US", {
                    timeZone: "America/Detroit",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })
                : "Never"}
            </span>
            {user.must_change_pin && <i>PIN change required</i>}
          </button>
        ))}
      </div>
      <form className="access-form" onSubmit={save}>
        <label>
          <span>
            <Mail size={15} />
            Email address
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
          />
        </label>
        <label>
          <span>
            <KeyRound size={15} />
            Temporary password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            placeholder="At least 8 characters"
            required
          />
        </label>
        <button className="sync-button" disabled={saving || !selected}>
          <Save size={16} />
          {saving ? "Saving…" : "Enable email sign-in"}
        </button>
      </form>
      {message && (
        <div className="access-message" role="status">
          {message}
        </div>
      )}
    </section>
  );
}

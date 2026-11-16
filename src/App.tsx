import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  ArrowLeft, ArrowUpRight, CheckCheck, Ellipsis, LogOut,
  Paperclip, Plus, Search, Send, Settings2, Smile,
  Sparkles, X,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

type Profile = {
  id: string;
  email: string;
  avatar_color: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type Conversation = {
  id: string;
  name: string | null;
  is_group: boolean;
  updated_at: string;
  members: Profile[];
  lastMessage?: Message;
};

type AuthMode = "login" | "signup";

function initials(name: string) {
  const label = name.includes("@") ? name.split("@")[0] : name;
  return label.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "?";
}

function formatTime(date: string) {
  const value = new Date(date);
  return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function relativeDate(date: string) {
  const value = new Date(date);
  const today = new Date();
  if (value.toDateString() === today.toDateString()) return formatTime(date);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (value.toDateString() === yesterday.toDateString()) return "Yesterday";
  return value.toLocaleDateString([], { month: "short", day: "numeric" });
}

function displayError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    const code = "code" in error && typeof error.code === "string" ? error.code : "";
    if ((code === "42703" || code === "PGRST204") && error.message.toLowerCase().includes("email")) {
      return "Email-based contacts aren't set up in Supabase yet. Apply supabase/migrations/202611100002_profile_emails.sql, then reload.";
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function Avatar({ name, color, size = "md", online = false }: { name: string; color: string; size?: "sm" | "md" | "lg"; online?: boolean }) {
  return (
    <span className={`avatar avatar-${size}`} style={{ backgroundColor: color }} aria-label={name}>
      {initials(name)}
      {online && <i className="online-dot" />}
    </span>
  );
}

function AuthScreen({ onSession }: { onSession: (session: Session) => void }) {
  const welcomeStatements = [
    "Build for genuine conversations.",
    "Email addresses from whitelisted domains.",
    "Mass blast to 12,000 addresses.",
    "Limited (50) new conversation initiations per domain per month.",
  ];
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showAccessApplication, setShowAccessApplication] = useState(false);
  const [applicationEmail, setApplicationEmail] = useState("");
  const [applicationMessage, setApplicationMessage] = useState("");
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [applicationError, setApplicationError] = useState("");
  const [applicationNotice, setApplicationNotice] = useState("");
  const applicationDomain = applicationEmail.trim().toLowerCase().split("@").pop() ?? "";
  const [typedCopy, setTypedCopy] = useState("");
  const [activeStatement, setActiveStatement] = useState(0);
  const [statementStruck, setStatementStruck] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(motionPreference.matches);
    updatePreference();
    motionPreference.addEventListener("change", updatePreference);
    return () => motionPreference.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;

    let cancelled = false;
    let timeout: number | undefined;
    const wait = (duration: number) => new Promise<void>((resolve) => {
      timeout = window.setTimeout(resolve, duration);
    });

    async function animateStatements() {
      while (!cancelled) {
        for (let index = 0; index < welcomeStatements.length; index += 1) {
          const statement = welcomeStatements[index];
          setActiveStatement(index);
          setTypedCopy("");
          setStatementStruck(false);

          for (let length = 1; length <= statement.length; length += 1) {
            if (cancelled) return;
            setTypedCopy(statement.slice(0, length));
            await wait(32);
          }

          if (index === 2) {
            await wait(180);
            if (cancelled) return;
            setStatementStruck(true);
          }

          await wait(900);
          if (cancelled) return;
          setStatementStruck(false);

          for (let length = statement.length - 1; length >= 0; length -= 1) {
            if (cancelled) return;
            setTypedCopy(statement.slice(0, length));
            await wait(17);
          }
          await wait(180);
        }
      }
    }

    void animateStatements();
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [prefersReducedMotion]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data: allowed, error: allowlistError } = await supabase.rpc("is_email_domain_allowed", {
          p_email: email.trim().toLowerCase(),
        });
        if (allowlistError) throw allowlistError;
        if (!allowed) {
          setError("That email domain isn’t whitelisted yet.");
          return;
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        if (data.session) onSession(data.session);
        else setNotice("Check your inbox for a confirmation link.");
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        onSession(data.session);
      }
    } catch (caught) {
      setError(displayError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitAccessApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setApplicationError("");
    setApplicationNotice("");
    setApplicationBusy(true);
    try {
      const normalizedEmail = applicationEmail.trim().toLowerCase();
      const domain = normalizedEmail.split("@").pop() ?? "";
      const { error: requestError } = await supabase.from("access_requests").insert({
        email: normalizedEmail,
        domain,
        message: applicationMessage.trim() || null,
      });
      if (requestError) throw requestError;
      setApplicationNotice("Thanks! Your request has been submitted.");
    } catch (caught) {
      setApplicationError(displayError(caught));
    } finally {
      setApplicationBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="welcome-motion" aria-hidden="true">
        <span className="welcome-orb welcome-orb-one" />
        <span className="welcome-orb welcome-orb-two" />
        <span className="welcome-orb welcome-orb-three" />
      </div>
      <div className="auth-topbar">
        <a className="brand" href="#" aria-label="Hamshake home"><img className="brand-mark" src="/favicon.png" alt="" />Hamshake</a>
      </div>
      <div className="auth-layout">
        <section className="auth-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR PEOPLE, YOUR PACE</div>
          <h1>Good conversations<br />have a <em>place.</em></h1>
          <p className="auth-description"></p>
          <div className="quote-card">
            <p className="welcome-typed-copy" aria-label={welcomeStatements.join(" ")}>
              <span className="typed-copy-reserve" aria-hidden="true">{welcomeStatements[3]}</span>
              {prefersReducedMotion ? <span className="typed-copy-static" aria-hidden="true">
                {welcomeStatements.map((statement, index) => <span key={statement} className={`typed-copy-line statement-${index + 1} ${index === 2 ? "is-struck" : ""}`}><strong>{statement}</strong></span>)}
              </span> : <span className={`typed-copy-line statement-${activeStatement + 1} ${statementStruck ? "is-struck" : ""}`} aria-hidden="true">
                <span className="typed-copy-text"><strong>{typedCopy}</strong></span>{typedCopy.length < welcomeStatements[activeStatement].length && <i className="typed-copy-cursor" />}
              </span>}
            </p>
            </div>
        </section>
        <section className="auth-card">
          <div className="card-sparkle"><Sparkles size={18} /></div>
          <div className="card-heading">{mode === "signup" ? "Find your people." : "Welcome back."}</div>
          <p className="card-subheading">{mode === "signup" ? "Your next favorite conversation starts here." : "Your conversations have been waiting."}</p>
          <div className="auth-tabs" role="tablist">
            <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Create account</button>
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Sign in</button>
          </div>
          <form onSubmit={submit}>
            <label className="field"><span>Email address</span><input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter email address" required /></label>
            <label className="field"><span>Password</span>
              <div className="password-field-wrap">
                <input autoComplete={mode === "signup" ? "new-password" : "current-password"} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            {error && <div className="form-message error-message" role="alert">{error}{mode === "signup" && error === "That email domain isn’t whitelisted yet." && <button type="button" onClick={() => { setApplicationEmail(email); setApplicationMessage(""); setApplicationError(""); setApplicationNotice(""); setShowAccessApplication(true); }}>Apply for access</button>}</div>}
            {notice && <div className="form-message success-message" role="status">{notice}</div>}
            <button className="primary-button auth-submit" type="submit" disabled={busy || !isSupabaseConfigured}>
              {busy ? "One moment..." : mode === "signup" ? "Create your account" : "Sign in"} <ArrowUpRight size={16} />
            </button>
          </form>
        </section>
      </div>
      <div className="auth-bottom"><span>© {new Date().getFullYear()} Hamshake</span><span>Build for genuine conversations</span><a href="mailto:muhammadashikh@hamshake.com">Help & support</a></div>
      {showAccessApplication && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAccessApplication(false); }}>
        <section className="new-chat-modal access-request-modal" role="dialog" aria-modal="true" aria-labelledby="access-request-title">
          <div className="modal-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> OPEN INVITATION</div><h2 id="access-request-title">Request access</h2><p>Tell us where to reach you and we’ll review your request.</p></div><button className="icon-button" type="button" title="Close" aria-label="Close" onClick={() => setShowAccessApplication(false)}><X size={18} /></button></div>
          <form onSubmit={(event) => void submitAccessApplication(event)}>
            <label className="field"><span>Email address</span><input autoComplete="email" type="email" value={applicationEmail} onChange={(event) => setApplicationEmail(event.target.value)} required /></label>
            <label className="field"><span>Email domain</span><input value={applicationDomain} readOnly aria-describedby="application-domain-help" /><small id="application-domain-help" className="field-hint">Filled automatically from your email address.</small></label>
            <label className="field"><span>Message <small>(optional)</small></span><textarea value={applicationMessage} onChange={(event) => setApplicationMessage(event.target.value)} rows={3} maxLength={1000} placeholder="A little about why you’d like to join" /></label>
            {applicationError && <div className="form-message error-message" role="alert">{applicationError}</div>}
            {applicationNotice && <div className="form-message success-message" role="status">{applicationNotice}</div>}
            {!applicationNotice && <div className="application-actions"><button className="secondary-button" type="button" onClick={() => setShowAccessApplication(false)}>Cancel</button><button className="primary-button" type="submit" disabled={applicationBusy || !isSupabaseConfigured}>{applicationBusy ? "Sending..." : "Submit request"} <ArrowUpRight size={16} /></button></div>}
          </form>
        </section>
      </div>}
    </main>
  );
}

function MessagingApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [contactsLoadError, setContactsLoadError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [startConversationError, setStartConversationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileListOpen, setMobileListOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const peer = activeConversation?.members.find((member) => member.id !== user.id);
  const myName = profile?.email || user.email || "You";
  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    const name = conversation.is_group ? conversation.name ?? "" : conversation.members.find((member) => member.id !== user.id)?.email ?? "";
    return name.toLowerCase().includes(query.toLowerCase());
  }), [conversations, query, user.id]);

  const loadWorkspace = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    setContactsLoaded(false);
    setContactsLoadError("");
    let contactsQuerySucceeded = false;
    try {
      const { data: myProfile, error: profileError } = await supabase.from("profiles").select("id,email,avatar_color").eq("id", user.id).single();
      if (profileError) throw profileError;
      setProfile(myProfile);

      const { data: profileRows, error: contactsError } = await supabase.from("profiles").select("id,email,avatar_color").neq("id", user.id).order("email");
      if (contactsError) {
        setContactsLoadError(displayError(contactsError));
        throw contactsError;
      }
      setContacts(profileRows ?? []);
      setContactsLoaded(true);
      contactsQuerySucceeded = true;

      const { data: memberships, error: membersError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id);
      if (membersError) throw membersError;
      const ids = (memberships ?? []).map((membership) => membership.conversation_id);
      if (!ids.length) {
        setConversations([]);
        setActiveId(null);
        return;
      }
      const [{ data: conversationRows, error: conversationsError }, { data: memberRows, error: peerError }, { data: messageRows, error: messagesError }] = await Promise.all([
        supabase.from("conversations").select("id,name,is_group,updated_at").in("id", ids).order("updated_at", { ascending: false }),
        supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id", ids),
        supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").in("conversation_id", ids).order("created_at", { ascending: false }),
      ]);
      if (conversationsError) throw conversationsError;
      if (peerError) throw peerError;
      if (messagesError) throw messagesError;
      const peers = (memberRows ?? []).map((member) => member.user_id);
      const { data: people, error: peopleError } = await supabase.from("profiles").select("id,email,avatar_color").in("id", peers.length ? peers : [user.id]);
      if (peopleError) throw peopleError;
      const peopleById = new Map((people ?? []).map((person) => [person.id, person as Profile]));
      const latestByConversation = new Map<string, Message>();
      for (const message of messageRows ?? []) {
        if (!latestByConversation.has(message.conversation_id)) latestByConversation.set(message.conversation_id, message as Message);
      }
      const loaded = (conversationRows ?? []).map((conversation) => ({
        ...conversation,
        members: (memberRows ?? []).filter((member) => member.conversation_id === conversation.id).map((member) => peopleById.get(member.user_id)).filter((person): person is Profile => Boolean(person)),
        lastMessage: latestByConversation.get(conversation.id),
      })) as Conversation[];
      setConversations(loaded);
      if (!activeIdRef.current || !loaded.some((conversation) => conversation.id === activeIdRef.current)) setActiveId(loaded[0]?.id ?? null);
    } catch (caught) {
      setError(displayError(caught));
      if (!contactsQuerySucceeded) setContactsLoadError(displayError(caught));
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  useEffect(() => {
    if (!supabase || !activeId) {
      setMessages([]);
      return;
    }
    let active = true;
    async function loadMessages() {
      const { data, error: messagesError } = await supabase!.from("messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id", activeId!).order("created_at");
      if (!active) return;
      if (messagesError) setError(messagesError.message);
      else setMessages((data ?? []) as Message[]);
    }
    void loadMessages();
    const channel = supabase.channel(`conversation-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` }, (payload) => {
        const message = payload.new as Message;
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        setConversations((current) => current.map((conversation) => conversation.id === activeId ? { ...conversation, lastMessage: message, updated_at: message.created_at } : conversation).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      })
      .subscribe();
    return () => { active = false; void supabase!.removeChannel(channel); };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!supabase || !activeId || !body || busy) return;
    setBusy(true);
    setError("");
    setDraft("");
    const { error: sendError } = await supabase.from("messages").insert({
      conversation_id: activeId,
      sender_id: user.id,
      body,
    });
    if (sendError) {
      setDraft(body);
      setError(sendError.message);
    }
    setBusy(false);
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function startConversation(contact: Profile) {
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    setStartConversationError("");
    const { data, error: startError } = await supabase.rpc("start_direct_conversation", { other_user_id: contact.id });
    if (startError) {
      setStartConversationError(startError.message);
      setBusy(false);
      return;
    }
    await loadWorkspace();
    setActiveId(data as string);
    setShowNewChat(false);
    setContactQuery("");
    setMobileListOpen(false);
    setBusy(false);
  }

  function openNewChat() {
    setStartConversationError("");
    setShowNewChat(true);
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else onSignOut();
  }

  const filteredContacts = contacts.filter((contact) => contact.email.toLowerCase().includes(contactQuery.toLowerCase()));

  return (
    <main className="messenger">
      <aside className={`inbox ${mobileListOpen ? "inbox-mobile-open" : ""}`}>
        <div className="inbox-top">
          <a className="brand inbox-brand" href="#"><img className="brand-mark" src="/favicon.png" alt="" />Hamshake</a>
        </div>
        <div className="inbox-welcome"><div className="welcome-date">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "2-digit" }).toUpperCase()}</div><p>A good day for a good conversation.</p></div>
        <div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a conversation" aria-label="Find a conversation" /><button className="search-add" type="button" title="New conversation" aria-label="New conversation" onClick={openNewChat}><Plus size={15} /></button></div>
        <div className="section-heading"><span>MESSAGES</span></div>
        <div className="conversation-list">
          {loading && <div className="inbox-empty">Finding your conversations...</div>}
          {!loading && visibleConversations.length === 0 && <div className="inbox-empty">{query ? "No conversations match that search." : "Your conversations will find their way here."}<button onClick={openNewChat}>Start a conversation <ArrowUpRight size={13} /></button></div>}
          {visibleConversations.map((conversation) => {
            const person = conversation.members.find((member) => member.id !== user.id);
            const title = conversation.is_group ? conversation.name ?? "Group conversation" : person?.email ?? "New conversation";
            return <button key={conversation.id} className={`conversation-row ${activeId === conversation.id ? "conversation-active" : ""}`} onClick={() => { setActiveId(conversation.id); setMobileListOpen(false); }}>
              <Avatar name={title} color={person?.avatar_color ?? "#b9c9b8"} size="md" />
              <span className="conversation-copy"><span className="conversation-line"><strong>{title}</strong><time>{relativeDate(conversation.lastMessage?.created_at ?? conversation.updated_at)}</time></span><span className="conversation-preview">{conversation.lastMessage?.sender_id === user.id ? "You: " : ""}{conversation.lastMessage?.body ?? "Say hello to get things started"}</span></span>
            </button>;
          })}
        </div>
        <div className="inbox-bottom"><div className="signed-in-card"><Avatar name={myName} color={profile?.avatar_color ?? "#d9b8a7"} size="sm" /><div className="signed-in-copy"><strong>{myName}</strong><span>Here for the good stuff</span></div><button title="Sign out" onClick={() => void signOut()}><LogOut size={15} /></button></div><span className="inbox-footer"> <span>✳</span></span></div>
      </aside>

      <section className={`chat-area ${mobileListOpen ? "chat-mobile-hidden" : ""}`}>
        {activeConversation && peer ? <>
          <header className="chat-header">
            <button className="icon-button mobile-back" title="Back to conversations" onClick={() => setMobileListOpen(true)}><ArrowLeft size={18} /></button>
            <Avatar name={peer.email} color={peer.avatar_color} size="md" />
            <div className="chat-header-copy"><h2>{peer.email}</h2></div>
            <div className="chat-actions"><button className="icon-button" title="Search conversation"><Search size={18} /></button><button className="icon-button" title="More options"><Ellipsis size={20} /></button></div>
          </header>
          <div className="message-scroll" ref={scrollRef}>
            <div className="message-list">
              {messages.map((message, index) => {
                const mine = message.sender_id === user.id;
                const prior = messages[index - 1];
                const sameSender = prior?.sender_id === message.sender_id;
                return <div key={message.id} className={`message-row ${mine ? "message-mine" : ""} ${sameSender ? "message-stacked" : ""}`}>
                  {!mine && <div className="message-avatar">{!sameSender && <Avatar name={peer.email} color={peer.avatar_color} size="sm" />}</div>}
                  <div className="message-content">{!sameSender && !mine && <div className="message-meta"><strong>{peer.email}</strong><time>{formatTime(message.created_at)}</time></div>}<div className="message-bubble">{message.body}</div>{mine && <div className="message-own-meta"><time>{formatTime(message.created_at)}</time><CheckCheck size={14} /></div>}</div>
                </div>;
              })}
            </div>
          </div>
          {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
          <form className="composer-wrap" onSubmit={(event) => void sendMessage(event)}>
            <div className="composer"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKey} placeholder={`Write a message to ${peer.email}...`} rows={1} aria-label="Write a message" maxLength={4000} /><div className="composer-tools"><div><button type="button" title="Attach file" disabled><Paperclip size={17} /></button><button type="button" title="Add emoji" disabled><Smile size={17} /></button><span className="composer-hint">Shift + Enter for a new line</span></div><button className="send-button" type="submit" disabled={!draft.trim() || busy} title="Send message"><Send size={16} /><span>Send</span></button></div></div>
          </form>
        </> : <div className="empty-chat">
          <div className="empty-illustration"><div className="empty-circle"><img className="empty-logo" src="/favicon.png" alt="" /></div><span className="float-star star-one">✳</span><span className="float-star star-two">✴</span><span className="float-dot" /></div>
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR LITTLE CORNER</div>
          <h1>Some things are<br />better <em>said.</em></h1>
          <p>Pick up where you left off, or start a fresh conversation with someone who makes your day a little brighter.</p>
          <button className="primary-button" onClick={openNewChat}>Start a conversation <ArrowUpRight size={16} /></button>
          <div className="empty-footnote"><span>✳</span> No rush. The good chats always find a way.</div>
        </div>}
      </section>

      {showNewChat && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewChat(false); }}>
        <section className="new-chat-modal" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
          <div className="modal-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> A NEW HELLO</div><h2 id="new-chat-title">Who’s on your mind?</h2></div><button className="icon-button" title="Close" onClick={() => setShowNewChat(false)}><X size={18} /></button></div>
          <div className="search-box modal-search"><Search size={16} /><input autoFocus value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} placeholder="Find someone by email" /></div>
          {startConversationError && <div className="form-message error-message" role="alert">{startConversationError}</div>}
          <div className="contact-list">
            {filteredContacts.map((contact) => <button key={contact.id} className="contact-row" onClick={() => void startConversation(contact)} disabled={busy}><Avatar name={contact.email} color={contact.avatar_color} size="md" /><span><strong>{contact.email}</strong></span><ArrowUpRight size={16} /></button>)}
            {filteredContacts.length === 0 && <div className="contact-empty">{contactsLoadError || (contactsLoaded ? contacts.length ? "No one with that email just yet." : "No one else has joined just yet. Check back soon." : "Loading contacts...")}</div>}
          </div>
          
        </section>
      </div>}
      {error && !activeConversation && <div className="toast-error" role="alert">{error}</div>}
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [configError, setConfigError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    let mounted = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setConfigError(error.message);
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCheckingSession(false);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  if (checkingSession) return <div className="loading-screen"><img className="brand-mark" src="/favicon.png" alt="" /><span>Hamshake</span></div>;
  if (session) return <><MessagingApp user={session.user} onSignOut={() => setSession(null)} />{configError && <div className="toast-error">{configError}</div>}</>;
  return <><AuthScreen onSession={setSession} />{!isSupabaseConfigured && <div className="setup-notice"><Settings2 size={16} /><div><strong>One last little setup.</strong><span>Add your Supabase URL and anon key to <code>.env</code>, then run the migration in <code>supabase/migrations</code>.</span></div><button title="Dismiss" onClick={(event) => event.currentTarget.parentElement?.remove()}><X size={15} /></button></div>}{configError && <div className="toast-error">{configError}</div>}</>;
}

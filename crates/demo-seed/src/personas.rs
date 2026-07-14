/// Demo contact roster and unassigned handles.

pub const OWNER_PHONE: &str = "+14155559000";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageScope {
    /// Individual thread only (no group chat membership).
    OneToOne,
    /// Appears in group chats only (no 1:1 file).
    Group,
    /// Both individual and group threads.
    Both,
}

#[derive(Debug, Clone)]
pub struct Contact {
    pub phones: Vec<String>,
    pub first_name: String,
    pub last_name: String,
    pub exclude: bool,
    pub groups: Vec<String>,
    /// When false, no messages of any kind.
    pub has_messages: bool,
    pub message_scope: MessageScope,
}

#[derive(Debug, Clone)]
pub struct Unassigned {
    pub handle: String,
    pub name_hint: Option<String>,
    pub email_only: bool,
}

#[derive(Debug)]
pub struct Roster {
    pub contacts: Vec<Contact>,
    pub unassigned: Vec<Unassigned>,
    pub exclude_handles: Vec<(String, String)>,
}

pub fn build_roster() -> Roster {
    let mut contacts = vec![
        // 1:1 only
        contact(
            &["+14155552301"],
            "Maya",
            "Chen",
            false,
            &["Family"],
            true,
            MessageScope::OneToOne,
        ),
        contact(
            &["+16175553402"],
            "Jordan",
            "Reed",
            false,
            &["Family", "College"],
            true,
            MessageScope::OneToOne,
        ),
        contact(
            &["+19175559008"],
            "Morgan",
            "Patel",
            false,
            &[],
            true,
            MessageScope::OneToOne,
        ),
        contact(
            &["+15035553412"],
            "Avery",
            "Stone",
            false,
            &[],
            true,
            MessageScope::OneToOne,
        ),
        contact(
            &["+12705557816"],
            "Parker",
            "Bell",
            false,
            &[],
            true,
            MessageScope::OneToOne,
        ),
        // Group only
        contact(
            &["+13035555604"],
            "Alex",
            "Martinez",
            false,
            &["Work"],
            true,
            MessageScope::Group,
        ),
        contact(
            &["+12065556705"],
            "Riley",
            "Nguyen",
            false,
            &["College"],
            true,
            MessageScope::Group,
        ),
        contact(
            &["+14805552311"],
            "Quinn",
            "Lopez",
            false,
            &["College"],
            true,
            MessageScope::Group,
        ),
        contact(
            &["+15805554513"],
            "Blake",
            "Turner",
            false,
            &["Family"],
            true,
            MessageScope::Group,
        ),
        contact(
            &["+13125556715"],
            "Skyler",
            "Wright",
            false,
            &["College"],
            true,
            MessageScope::Group,
        ),
        // Both
        contact(
            &["+12125554503"],
            "Sam",
            "Okafor",
            false,
            &["Work"],
            true,
            MessageScope::Both,
        ),
        contact(
            &["+17135557806"],
            "Casey",
            "Brooks",
            false,
            &["Family"],
            true,
            MessageScope::Both,
        ),
        contact(
            &["+18125558907"],
            "Taylor",
            "Singh",
            false,
            &["Work", "College"],
            true,
            MessageScope::Both,
        ),
        contact(
            &["+14045550109"],
            "Jamie",
            "Foster",
            false,
            &["Family"],
            true,
            MessageScope::Both,
        ),
        contact(
            &["+13105551210"],
            "Drew",
            "Kim",
            false,
            &["Work"],
            true,
            MessageScope::Both,
        ),
        contact(
            &["+16025555614"],
            "Cameron",
            "Hayes",
            false,
            &["Work"],
            true,
            MessageScope::Both,
        ),
        contact(
            &["+14245558917"],
            "Reese",
            "Cole",
            false,
            &["Family"],
            true,
            MessageScope::Both,
        ),
        contact(
            &["+15105559018"],
            "Logan",
            "Price",
            false,
            &["Work"],
            true,
            MessageScope::Both,
        ),
        // Excluded with messages (1:1 only)
        contact(
            &["+12145550119"],
            "Old",
            "Roommate",
            true,
            &[],
            true,
            MessageScope::OneToOne,
        ),
        contact(
            &["+18885550120"],
            "Marketing",
            "Blast",
            true,
            &[],
            true,
            MessageScope::OneToOne,
        ),
        contact(
            &["+18005550121"],
            "Telemarketer",
            "X",
            true,
            &[],
            true,
            MessageScope::OneToOne,
        ),
        // Multi-phone
        contact(
            &["+14155552222", "+16505553333"],
            "Pat",
            "MultiPhone",
            false,
            &["Work"],
            true,
            MessageScope::Both,
        ),
        contact(
            &["+13125554444", "+19725556666"],
            "Chris",
            "DualLine",
            false,
            &["Family"],
            true,
            MessageScope::Both,
        ),
        // No messages
        contact(
            &["+17025550126"],
            "Empty",
            "ContactA",
            false,
            &["College"],
            false,
            MessageScope::Both,
        ),
        contact(
            &["+12565550127"],
            "Empty",
            "ContactB",
            false,
            &[],
            false,
            MessageScope::Both,
        ),
        contact(
            &["+19195550128"],
            "Empty",
            "ContactC",
            true,
            &[],
            false,
            MessageScope::Both,
        ),
        contact(
            &["+13175550129"],
            "Empty",
            "ContactD",
            false,
            &["Work"],
            false,
            MessageScope::Both,
        ),
        contact(
            &["+14085550130"],
            "NoChat",
            "Ever",
            false,
            &[],
            false,
            MessageScope::Both,
        ),
    ];

    contacts.push(Contact {
        phones: vec!["+447700900231".into()],
        first_name: "Mononym".into(),
        last_name: String::new(),
        exclude: false,
        groups: vec![],
        has_messages: true,
        message_scope: MessageScope::OneToOne,
    });
    contacts.push(Contact {
        phones: vec!["+33612345678".into()],
        first_name: String::new(),
        last_name: "SurnameOnly".into(),
        exclude: false,
        groups: vec!["Family".into()],
        has_messages: true,
        message_scope: MessageScope::Group,
    });

    let unassigned = vec![
        Unassigned {
            handle: "+18885559001".into(),
            name_hint: Some("Unknown Caller".into()),
            email_only: false,
        },
        Unassigned {
            handle: "+12125550017".into(),
            name_hint: None,
            email_only: false,
        },
        Unassigned {
            handle: "stranger@demo.example".into(),
            name_hint: Some("Stranger Email".into()),
            email_only: true,
        },
        Unassigned {
            handle: "contractor@demo.example".into(),
            name_hint: Some("Contractor".into()),
            email_only: true,
        },
        Unassigned {
            handle: "+447700900888".into(),
            name_hint: Some("(Unverified)".into()),
            email_only: false,
        },
        Unassigned {
            handle: "+61491570156".into(),
            name_hint: None,
            email_only: false,
        },
    ];

    let exclude_handles = vec![
        ("28747".into(), "BANKALERT".into()),
        ("69243".into(), "PROMO".into()),
        ("737373".into(), "VERIFY".into()),
    ];

    Roster {
        contacts,
        unassigned,
        exclude_handles,
    }
}

fn contact(
    phones: &[&str],
    first: &str,
    last: &str,
    exclude: bool,
    groups: &[&str],
    has_messages: bool,
    message_scope: MessageScope,
) -> Contact {
    Contact {
        phones: phones.iter().map(|p| (*p).to_string()).collect(),
        first_name: first.into(),
        last_name: last.into(),
        exclude,
        groups: groups.iter().map(|g| (*g).to_string()).collect(),
        has_messages,
        message_scope,
    }
}

impl Contact {
    pub fn primary_phone(&self) -> &str {
        &self.phones[0]
    }

    pub fn display_hint(&self) -> String {
        let parts = [self.first_name.as_str(), self.last_name.as_str()]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();
        parts.join(" ")
    }

    pub fn has_one_to_one(&self) -> bool {
        self.has_messages
            && matches!(
                self.message_scope,
                MessageScope::OneToOne | MessageScope::Both
            )
    }

    pub fn has_group(&self) -> bool {
        self.has_messages
            && !self.exclude
            && matches!(self.message_scope, MessageScope::Group | MessageScope::Both)
    }
}

/// Varied group chat identifiers (generic ids, toll-free, international).
pub const GROUP_CHAT_IDS: &[&str] = &[
    "chat1847293051",
    "+18005554321",
    "+447700900555",
    "chat2093847561",
    "+18885556789",
    "+33612349876",
    "+12125558888",
    "chat3159264078",
    "+61491570999",
    "+17135554444",
    "chat4281736509",
    "+13035557777",
    "+16175556666",
    "chat5392847610",
    "+19175552222",
    "+15805553333",
];

/// Empty group thread placeholder (header only, no messages).
pub const EMPTY_GROUP_HANDLE: &str = "chat0000000001";

/// Empty 1:1 thread placeholder handle.
pub const EMPTY_THREAD_HANDLE: &str = "+18007438200";

/// Orphaned-message sender stub (not in contacts).
pub const ORPHAN_SENDER: &str = "+447700900999";

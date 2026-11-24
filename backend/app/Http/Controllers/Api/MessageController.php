<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Department;
use App\Models\Message;
use App\Models\MessageAttachment;
use App\Models\MessageRecipient;
use App\Models\User;
use App\Services\MessagingRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MessageController extends Controller
{
    private const DISK = 'local';

    public function __construct(private MessagingRules $rules) {}

    public function index(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $request->validate([
            'folder' => ['nullable', Rule::in(['inbox', 'sent', 'archive'])],
            'search' => ['nullable', 'string', 'max:80'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $folder = $data['folder'] ?? 'inbox';
        $search = trim($data['search'] ?? '');

        $q = Message::query()->with('sender:id,name', 'attachments:id,message_id')->withCount('recipients');
        if ($folder === 'sent') {
            $q->where('sender_id', $me->id);
        } else {
            $q->whereHas('recipients', fn ($r) => $r->where('user_id', $me->id)
                ->when($folder === 'inbox', fn ($w) => $w->whereNull('archived_at'), fn ($w) => $w->whereNotNull('archived_at')));
        }
        if ($search !== '') {
            $q->where(fn ($w) => $w->where('subject', 'like', "%{$search}%")->orWhere('body', 'like', "%{$search}%")
                ->orWhereHas('sender', fn ($s) => $s->where('name', 'like', "%{$search}%")));
        }
        $page = $q->orderByDesc('id')->paginate(30);
        $mine = MessageRecipient::where('user_id', $me->id)->whereIn('message_id', $page->pluck('id'))->get()->keyBy('message_id');
        $firstTo = MessageRecipient::with('user:id,name')->whereIn('message_id', $page->pluck('id'))->orderBy('id')->get()->groupBy('message_id');

        return response()->json([
            'messages' => $page->getCollection()->map(fn (Message $m) => [
                'id' => $m->id, 'subject' => $m->subject, 'kind' => $m->kind,
                'preview' => mb_substr(preg_replace('/\s+/u', ' ', $m->body), 0, 120),
                'sender' => $m->sender?->only('id', 'name'),
                'to' => $m->groups_label ?: ($firstTo[$m->id] ?? collect())->take(3)->map(fn ($r) => $r->user?->name)->filter()->implode('، '),
                'recipients_count' => $m->recipients_count,
                'has_attachments' => $m->attachments->isNotEmpty(),
                'read' => $folder === 'sent' ? true : (bool) ($mine[$m->id]->read_at ?? false),
                'created_at' => $m->created_at?->toIso8601String(),
            ]),
            'has_more' => $page->hasMorePages(),
            'unread' => $this->unreadCount($me->id),
        ]);
    }

    public function unread(Request $request): JsonResponse
    {
        return response()->json(['unread' => $this->unreadCount($request->user()->id)]);
    }

    /** One message with its whole conversation. Opening it marks it read. */
    public function show(Request $request, Message $message): JsonResponse
    {
        $me = $request->user();
        abort_unless($this->canSee($message, $me), 404);
        MessageRecipient::where('message_id', $message->id)->where('user_id', $me->id)->whereNull('read_at')->update(['read_at' => now()]);

        $threadId = $message->thread_id ?? $message->id;
        $thread = Message::where(fn ($q) => $q->where('id', $threadId)->orWhere('thread_id', $threadId))
            ->orderBy('id')->get()->filter(fn ($m) => $this->canSee($m, $me))->values();
        MessageRecipient::whereIn('message_id', $thread->pluck('id'))->where('user_id', $me->id)->whereNull('read_at')->update(['read_at' => now()]);
        $archived = MessageRecipient::where('message_id', $message->id)->where('user_id', $me->id)->value('archived_at');

        return response()->json([
            'thread' => $thread->map(fn ($m) => $this->present($m)),
            'current_id' => $message->id,
            'archived' => $archived !== null,
            'unread' => $this->unreadCount($me->id),
            'can_reply_all' => true,
        ]);
    }

    /** People and groups the sender may choose. */
    public function recipients(Request $request): JsonResponse
    {
        $me = $request->user();
        $search = trim((string) $request->query('search', ''));
        $people = $this->rules->reachable($me)->with('role:id,key,name', 'branch:id,name', 'employee:id,user_id,job_title')
            ->when($search !== '', fn ($q) => $q->where('name', 'like', "%{$search}%"))
            ->orderBy('name')->limit(300)->get()
            ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'role' => $u->role?->name, 'role_key' => $u->role?->key,
                'branch' => $u->branch?->name, 'job_title' => $u->employee?->job_title]);

        $groups = [];
        $scope = $this->rules->groupScope($me);
        if ($scope === 'all') {
            $groups[] = ['type' => 'all', 'id' => null, 'name' => 'جميع الموظفين'];
            foreach (Branch::orderBy('name')->get(['id', 'name']) as $b) {
                $groups[] = ['type' => 'branch', 'id' => $b->id, 'name' => "فرع {$b->name}"];
            }
            foreach (Department::where('is_active', true)->orderBy('name')->get(['id', 'name']) as $d) {
                $groups[] = ['type' => 'department', 'id' => $d->id, 'name' => "قسم {$d->name}"];
            }
        } elseif ($scope === 'branch' && $me->branch_id) {
            $groups[] = ['type' => 'branch', 'id' => $me->branch_id, 'name' => 'فرع '.Branch::whereKey($me->branch_id)->value('name')];
        }

        return response()->json(['people' => $people, 'groups' => $groups]);
    }

    public function store(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $request->validate([
            'to' => ['array', 'max:500'],
            'to.*' => ['integer', 'distinct'],
            'groups' => ['array', 'max:20'],
            'groups.*.type' => ['required', Rule::in(['all', 'branch', 'department'])],
            'groups.*.id' => ['nullable', 'integer'],
            'subject' => ['required', 'string', 'min:1', 'max:200'],
            'body' => ['required', 'string', 'min:1', 'max:20000'],
            'kind' => ['nullable', Rule::in(Message::KINDS)],
            'meta' => ['nullable', 'array'],
            'meta.from' => ['nullable', 'date_format:Y-m-d'],
            'meta.to' => ['nullable', 'date_format:Y-m-d'],
            'meta.date' => ['nullable', 'date_format:Y-m-d'],
            'meta.from_time' => ['nullable', 'date_format:H:i'],
            'meta.to_time' => ['nullable', 'date_format:H:i'],
            'reply_to' => ['nullable', 'integer', Rule::exists('messages', 'id')],
            'forward_of' => ['nullable', 'integer', Rule::exists('messages', 'id')],
            'files' => ['array', 'max:5'],
            'files.*' => ['file', 'max:10240', 'mimes:jpg,jpeg,png,webp,heic,pdf,doc,docx,xls,xlsx'],
        ]);

        $parent = isset($data['reply_to']) ? Message::find($data['reply_to']) : null;
        $forwarded = isset($data['forward_of']) ? Message::find($data['forward_of']) : null;
        if (($parent && ! $this->canSee($parent, $me)) || ($forwarded && ! $this->canSee($forwarded, $me))) {
            abort(404);
        }

        // Individual recipients: reachable by the rules, or part of the conversation being answered.
        $ids = collect($data['to'] ?? [])->map(fn ($v) => (int) $v)->reject(fn ($v) => $v === $me->id)->unique();
        $threadPeople = $parent ? $this->participants($parent) : collect();
        foreach ($ids as $id) {
            if (! $threadPeople->contains($id) && ! $this->rules->canReach($me, $id)) {
                throw ValidationException::withMessages(['to' => 'لا يمكنك مراسلة أحد المستلمين المختارين.']);
            }
        }

        // Groups, expanded to people now.
        $labels = [];
        $scope = $this->rules->groupScope($me);
        foreach ($data['groups'] ?? [] as $g) {
            $ok = $scope === 'all' || ($scope === 'branch' && $g['type'] === 'branch' && (int) ($g['id'] ?? 0) === $me->branch_id);
            if (! $ok) {
                throw ValidationException::withMessages(['groups' => 'ليست لديك صلاحية المراسلة الجماعية لهذه المجموعة.']);
            }
            $q = User::where('is_active', true)->where('id', '!=', $me->id);
            match ($g['type']) {
                'branch' => $q->where('branch_id', $g['id']),
                'department' => $q->whereHas('employee', fn ($e) => $e->where('department_id', $g['id'])),
                default => null,
            };
            $ids = $ids->merge($q->pluck('id'));
            $labels[] = match ($g['type']) {
                'all' => 'جميع الموظفين',
                'branch' => 'فرع '.Branch::whereKey($g['id'])->value('name'),
                'department' => 'قسم '.Department::whereKey($g['id'])->value('name'),
            };
        }
        $ids = $ids->unique()->values();
        if ($ids->isEmpty()) {
            throw ValidationException::withMessages(['to' => 'اختر مستلماً واحداً على الأقل.']);
        }

        $message = DB::transaction(function () use ($me, $data, $parent, $forwarded, $ids, $labels, $request) {
            $m = Message::create([
                'sender_id' => $me->id,
                'thread_id' => $parent ? ($parent->thread_id ?? $parent->id) : null,
                'parent_id' => $parent?->id,
                'forwarded_from_id' => $forwarded?->id,
                'kind' => $data['kind'] ?? 'message',
                'subject' => trim($data['subject']),
                'body' => trim($data['body']),
                'meta' => $data['meta'] ?? null,
                'groups_label' => $labels ? implode('، ', $labels) : null,
            ]);
            $now = now();
            foreach ($ids->chunk(200) as $chunk) {
                MessageRecipient::insert($chunk->map(fn ($id) => ['message_id' => $m->id, 'user_id' => $id, 'created_at' => $now, 'updated_at' => $now])->all());
            }
            foreach ($request->file('files', []) as $file) {
                $m->attachments()->create([
                    'path' => $file->store("messages/{$m->id}", self::DISK),
                    'name' => mb_substr($file->getClientOriginalName(), 0, 200),
                    'mime' => $file->getMimeType() ?? 'application/octet-stream',
                    'size' => $file->getSize(),
                ]);
            }

            return $m;
        });

        return response()->json(['message' => $this->present($message->fresh())], 201);
    }

    public function archive(Request $request, Message $message): JsonResponse
    {
        $row = MessageRecipient::where('message_id', $message->id)->where('user_id', $request->user()->id)->firstOrFail();
        $archive = $request->boolean('archive', true);
        $row->forceFill(['archived_at' => $archive ? now() : null])->save();

        return response()->json(['archived' => $archive]);
    }

    public function markUnread(Request $request, Message $message): JsonResponse
    {
        MessageRecipient::where('message_id', $message->id)->where('user_id', $request->user()->id)->update(['read_at' => null]);

        return response()->json(['unread' => $this->unreadCount($request->user()->id)]);
    }

    public function attachment(Request $request, Message $message, MessageAttachment $attachment): StreamedResponse
    {
        abort_unless($attachment->message_id === $message->id && $this->canSee($message, $request->user()), 404);

        return Storage::disk(self::DISK)->response($attachment->path, $attachment->name, [
            'Content-Type' => $attachment->mime, 'Cache-Control' => 'private, no-store',
        ], 'inline');
    }

    /** Sender, recipient, or a recipient of a forward that carries this message. */
    private function canSee(Message $m, User $u, int $depth = 0): bool
    {
        if ($m->sender_id === $u->id || MessageRecipient::where('message_id', $m->id)->where('user_id', $u->id)->exists()) {
            return true;
        }
        if ($depth > 4) {
            return false;
        }
        foreach (Message::where('forwarded_from_id', $m->id)->get() as $fw) {
            if ($this->canSee($fw, $u, $depth + 1)) {
                return true;
            }
        }

        return false;
    }

    private function participants(Message $m)
    {
        $threadId = $m->thread_id ?? $m->id;
        $ids = Message::where(fn ($q) => $q->where('id', $threadId)->orWhere('thread_id', $threadId))->pluck('id');

        return Message::whereIn('id', $ids)->pluck('sender_id')
            ->merge(MessageRecipient::whereIn('message_id', $ids)->pluck('user_id'))->unique()->values();
    }

    private function unreadCount(int $userId): int
    {
        return MessageRecipient::where('user_id', $userId)->whereNull('read_at')->whereNull('archived_at')->count();
    }

    private function present(Message $m, int $depth = 0): array
    {
        $m->loadMissing('sender:id,name', 'attachments', 'recipients.user:id,name');

        return [
            'id' => $m->id, 'thread_id' => $m->thread_id ?? $m->id, 'kind' => $m->kind, 'subject' => $m->subject, 'body' => $m->body,
            'meta' => $m->meta, 'sender' => $m->sender?->only('id', 'name'),
            'groups_label' => $m->groups_label,
            'recipients' => $m->recipients->take(50)->map(fn ($r) => ['id' => $r->user_id, 'name' => $r->user?->name, 'read' => $r->read_at !== null])->values(),
            'recipients_count' => $m->recipients->count(),
            'attachments' => $m->attachments->map(fn ($a) => ['id' => $a->id, 'name' => $a->name, 'mime' => $a->mime, 'size' => $a->size])->values(),
            'forwarded' => $m->forwarded_from_id && $depth < 2 && $m->forwardedFrom ? $this->present($m->forwardedFrom, $depth + 1) : null,
            'created_at' => $m->created_at?->toIso8601String(),
        ];
    }
}

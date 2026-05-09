import { Component, ElementRef, inject, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { GlassCardComponent } from '../../shared/components/glass-card/glass-card';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, GlassCardComponent],
  template: `
    <app-glass-card title="System Log Streamer" icon="📟" extraClass="h-full flex flex-col">
      <div #terminalContainer class="flex-grow overflow-y-auto bg-black/60 border border-white/5 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-2 h-[450px]">
        @for (log of logs(); track log) {
          <div class="leading-relaxed whitespace-pre-wrap">
            <span class="text-slate-500 font-semibold">[{{ log.time }}]</span>
            <span class="font-bold uppercase px-1 rounded-sm mx-2 text-[10px]"
              [ngClass]="{
                'text-cyan-400 bg-cyan-950/40 border border-cyan-500/20': log.level === 'info' || log.level === 'INFO',
                'text-amber-400 bg-amber-950/40 border border-amber-500/20': log.level === 'warn' || log.level === 'WARN',
                'text-rose-400 bg-rose-950/40 border border-rose-500/20': log.level === 'error' || log.level === 'ERROR'
              }">
              {{ log.level }}
            </span>
            <span class="text-slate-100">{{ log.msg }}</span>
            @if (log.error) {
              <span class="text-rose-400 font-semibold block ml-20">error: {{ log.error }}</span>
            }
          </div>
        } @empty {
          <div class="text-slate-500 italic text-center py-20">Waiting for system log packets to buffer...</div>
        }
      </div>
    </app-glass-card>
  `
})
export class LogsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  logs = signal<any[]>([]);
  private pollInterval: any;

  @ViewChild('terminalContainer') private terminalContainer!: ElementRef;

  ngOnInit() {
    this.fetchLogs();
    this.pollInterval = setInterval(() => this.fetchLogs(), 2000);
  }

  ngOnDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  private fetchLogs() {
    this.api.getLogs().subscribe({
      next: (data) => {
        if (data) {
          const formatted = data.map((l: any) => {
            if (typeof l === 'string') {
              try {
                const parsed = JSON.parse(l);
                return {
                  time: parsed.time ? new Date(parsed.time).toLocaleTimeString() : new Date().toLocaleTimeString(),
                  level: parsed.level || 'INFO',
                  msg: parsed.msg || parsed.message || l
                };
              } catch {
                return { time: new Date().toLocaleTimeString(), level: 'INFO', msg: l };
              }
            }
            return {
              time: l.time ? new Date(l.time).toLocaleTimeString() : new Date().toLocaleTimeString(),
              level: l.level || 'INFO',
              msg: l.msg || l.message || JSON.stringify(l),
              error: l.error
            };
          });
          this.logs.set(formatted);
          this.scrollToBottom();
        }
      },
      error: (err) => console.error('Failed to poll logs', err)
    });
  }

  private scrollToBottom() {
    setTimeout(() => {
      try {
        if (this.terminalContainer) {
          this.terminalContainer.nativeElement.scrollTop = this.terminalContainer.nativeElement.scrollHeight;
        }
      } catch (err) {
        // Safe check
      }
    }, 100);
  }
}

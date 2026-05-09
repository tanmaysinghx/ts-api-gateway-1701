import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pulse-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center gap-2">
      <span class="relative flex h-3 w-3">
        @if (healthy) {
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-md shadow-emerald-500/50"></span>
        } @else {
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-3 w-3 bg-rose-500 shadow-md shadow-rose-500/50"></span>
        }
      </span>
      <span class="text-xs font-medium" [ngClass]="healthy ? 'text-emerald-400' : 'text-rose-400'">
        {{ label }}
      </span>
    </div>
  `
})
export class PulseNodeComponent {
  @Input() healthy: boolean = false;
  @Input() label: string = '';
}

import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-glass-card',
  standalone: true,
  template: `
    <div class="relative bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-xl transition-all duration-300 hover:border-white/20 hover:shadow-2xl hover:shadow-cyan-500/5 {{ extraClass }}">
      @if (title) {
        <div class="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
          <h3 class="text-lg font-semibold text-slate-100 flex items-center gap-2">
            @if (icon) {
              <span class="text-cyan-400 text-xl">{{ icon }}</span>
            }
            {{ title }}
          </h3>
          <ng-content select="[card-header-actions]"></ng-content>
        </div>
      }
      <ng-content></ng-content>
    </div>
  `
})
export class GlassCardComponent {
  @Input() title: string = '';
  @Input() icon: string = '';
  @Input() extraClass: string = '';
}

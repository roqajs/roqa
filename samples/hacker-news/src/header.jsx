import { defineComponent, cell, get, set } from 'rift-js';
import { FEEDS } from './feeds.js';
import './header.css';

function Header({ changeFeed }) {
	const currentFeed = cell(FEEDS.top);

	const activeClass = (current, feed) => (current === feed ? 'nav-link active' : 'nav-link');

	const handleFeedClick = (feed) => {
		set(currentFeed, feed);
		changeFeed(feed);
	};

	return (
		<header>
			<div class="header-content">
				<a href="#" class="logo">
					<span class="logo-icon">Y</span>
					<span class="logo-text">Hacker News</span>
				</a>
				<nav class="nav-links">
					<button
						class={activeClass(get(currentFeed), FEEDS.top)}
						onclick={handleFeedClick(FEEDS.top)}
					>
						top
					</button>
					<button
						class={activeClass(get(currentFeed), FEEDS.new)}
						onclick={handleFeedClick(FEEDS.new)}
					>
						new
					</button>
					<button
						class={activeClass(get(currentFeed), FEEDS.best)}
						onclick={handleFeedClick(FEEDS.best)}
					>
						best
					</button>
					<button
						class={activeClass(get(currentFeed), FEEDS.ask)}
						onclick={handleFeedClick(FEEDS.ask)}
					>
						ask
					</button>
					<button
						class={activeClass(get(currentFeed), FEEDS.show)}
						onclick={handleFeedClick(FEEDS.show)}
					>
						show
					</button>
					<button
						class={activeClass(get(currentFeed), FEEDS.job)}
						onclick={handleFeedClick(FEEDS.job)}
					>
						job
					</button>
				</nav>
			</div>
		</header>
	);
}

defineComponent('hn-header', Header);

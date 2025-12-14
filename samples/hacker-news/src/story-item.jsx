import { defineComponent } from 'rift-js';
import './story-item.css';

function StoryItem({ story, index }) {
	const timeAgo = (timestamp) => {
		const seconds = Math.floor(Date.now() / 1000 - timestamp);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	};

	const getDomain = (url) => {
		if (!url) return '';
		try {
			const domain = new URL(url).hostname.replace('www.', '');
			return domain;
		} catch {
			return '';
		}
	};

	const handleCommentsClick = (e) => {
		e.preventDefault();
		// Dispatch custom event to parent
		this.dispatchEvent(
			new CustomEvent('viewcomments', {
				bubbles: true,
				detail: { storyId: story.id },
			})
		);
	};

	const storyUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
	const domain = getDomain(story.url);
	const domainDisplay = domain ? `(${domain})` : '';

	return (
		<article class="story">
			<span class="rank">{index + 1}.</span>
			<div class="story-content">
				<div class="story-title">
					<a href={storyUrl} target="_blank" rel="noopener noreferrer" class="title-link">
						{story.title}
					</a>
					<span class="domain">{domainDisplay}</span>
				</div>
				<div class="story-meta">
					<span class="score">{story.score + ' points'}</span>
					<span class="separator">|</span>
					<span class="author">{'by ' + story.by}</span>
					<span class="separator">|</span>
					<span class="time">{timeAgo(story.time)}</span>
					<span class="separator">|</span>
					<a href="#" onclick={handleCommentsClick} class="comments">
						{(story.descendants || 0) + ' comments'}
					</a>
				</div>
			</div>
		</article>
	);
}

defineComponent('story-item', StoryItem);
